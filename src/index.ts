/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { RiskProfile } from './types/risk-profile';
import { handleActivitySubmission } from './workflows/activity-submission';
import { handlePartnerQuote } from './workflows/partner-quotes';
import { ActivitySubmissionMessage, PartnerQuoteMessage } from './types/messages';
import { PartnerQuoteWorkflow } from './workflows/partner-quotes';

// Queue message types
interface QueueMessageData {
	activityId: string;
	formData: any;
	partnerId?: string;
	quoteData?: any;
}

export interface Env {
	CUSTOMERS: DurableObjectNamespace;
	ACTIVITIES: DurableObjectNamespace;
	PARTNERS: DurableObjectNamespace;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	ACTIVITY: DurableObjectNamespace;
	ACTIVITY_SUBMISSION_QUEUE: Queue;
	PARTNER_QUOTES_QUEUE: Queue;
	PARTNER_QUOTE_WORKFLOW: WorkflowNamespace<PartnerQuoteParams>;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		
		// API routes
		if (url.pathname.startsWith('/api/')) {
			const parts = url.pathname.split('/').filter(Boolean);
			
			if (parts[1] === 'customer' && parts[3] === 'activity') {
				const customerId = parts[2];
				const activityId = parts[4];
				
				if (customerId && activityId) {
					try {
						console.log('[index] Handling request for activity:', activityId);
						console.log('[index] Request type:', request.headers.get('Upgrade') || 'HTTP');
						
						const activityDO = env.ACTIVITIES.get(
							env.ACTIVITIES.idFromString(activityId)
						);
						
						return await activityDO.fetch(request);
					} catch (err) {
						console.error('[index] Activity DO error:', err);
						return new Response('Invalid activity ID', { status: 400 });
					}
				}
			}
			
			return new Response('Not found', { status: 404 });
		}

		// Handle static assets and pages
		if (url.pathname === '/quote/new') {
			// Create new customer and activity
			const customerId = await createNewCustomer(env);
			const customerDO = env.CUSTOMERS.get(env.CUSTOMERS.idFromString(customerId));
			
			// Create new activity
			const response = await customerDO.fetch(new Request(url.origin + '/api/activities', {
				method: 'POST'
			}));
			
			if (!response.ok) {
				return new Response('Failed to create activity', { status: 500 });
			}
			
			const { id: activityId } = await response.json() as { id: string };
			
			// Redirect to the quote form
			return Response.redirect(
				`${url.origin}/customer/${customerId}/activity/${activityId}/quote`,
				302
			);
		}

		// Handle quote form page
		const quoteMatch = url.pathname.match(/^\/customer\/([^\/]+)\/activity\/([^\/]+)\/quote$/);
		if (quoteMatch) {
			return new Response(
				await env.ASSETS.fetch(new Request(url.origin + '/quote.html')).then(res => res.text()),
				{
					headers: { 'Content-Type': 'text/html;charset=UTF-8' }
				}
			);
		}

		// Add handler for results page with new pattern
		const resultsMatch = url.pathname.match(/^\/customer\/([^\/]+)\/activity\/([^\/]+)\/results$/);
		if (resultsMatch) {
			return new Response(
				await env.ASSETS.fetch(new Request(url.origin + '/quote-results.html')).then(res => res.text()),
				{
					headers: { 'Content-Type': 'text/html;charset=UTF-8' }
				}
			);
		}

		// Serve other static assets
		return env.ASSETS.fetch(request);
	},

	// Queue handler with correct typing
	async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log('Queue consumer started, processing batch of:', batch.messages.length);
		
		for (const message of batch.messages) {
			try {
				const body = message.body as QueueMessageData;
				
				// Determine queue type from message content
				if ('formData' in body && !('quoteData' in body)) {
					console.log('Queue message received : activity submission');
					// Fire and forget - don't await the result
					ctx.waitUntil(
						handleActivitySubmission(body as ActivitySubmissionMessage, env)
							.catch(error => console.error('Activity submission error:', error))
					);
				} else if ('quoteData' in body && 'partnerId' in body) {
					// Instead of calling the function, create a workflow instance
					console.log('Creating partner quote workflow');
					ctx.waitUntil(
						env.PARTNER_QUOTE_WORKFLOW.create({
							params: {
								activityId: body.activityId,
								partnerId: body.partnerId,
								quoteData: body.quoteData
							}
						}).catch(error => console.error('Failed to create workflow:', error))
					);
				} else {
					console.error('Unknown message type:', body);
					continue;
				}
				message.ack();
			} catch (error) {
				console.error('Failed to process message:', error);
				message.retry();
			}
		}
	}
} satisfies ExportedHandler<Env>;

async function createNewCustomer(env: Env): Promise<string> {
	const id = env.CUSTOMERS.newUniqueId();
	const customer = env.CUSTOMERS.get(id);
	await customer.fetch(new Request('http://dummy/init', { method: 'POST' }));
	return id.toString();
}

export { CustomerDO } from './durable_objects/customer';
export { ActivityDO } from './durable_objects/activity';
export { PartnerDO } from './durable_objects/partner';
export { PartnerQuoteWorkflow } from './workflows/partner-quotes';
