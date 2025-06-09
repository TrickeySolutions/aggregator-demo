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

export interface Env {
	CUSTOMERS: DurableObjectNamespace;
	ACTIVITIES: DurableObjectNamespace;
	PARTNERS: DurableObjectNamespace;
	ASSETS: Fetcher;
	AI: {
		run(model: string, options: any): Promise<{ response: string } | ReadableStream>;
	};
	TURNSTILE_SECRET_KEY: string;
	PARTNER_LOGOS: R2Bucket;
	AI_GATEWAY_ID?: string; // Optional gateway ID for AI Gateway configuration
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log('[index] TURNSTILE_SECRET_KEY present:', !!env.TURNSTILE_SECRET_KEY);
		
		const url = new URL(request.url);
		
		// Handle partner logo requests
		if (url.pathname.startsWith('/partner-logos/')) {
			const key = url.pathname.replace('/partner-logos/', '');
			if (!key) {
				return new Response('Not Found', { status: 404 });
			}

			const object = await env.PARTNER_LOGOS.get(key);
			if (!object) {
				return new Response('Not Found', { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);
			headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

			return new Response(object.body, {
				headers,
			});
		}
		
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
