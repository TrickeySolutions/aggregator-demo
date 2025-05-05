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

export interface Env {
	CUSTOMERS: DurableObjectNamespace;
	ACTIVITIES: DurableObjectNamespace;
	PARTNERS: DurableObjectNamespace;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		
		// API routes
		if (url.pathname.startsWith('/api/')) {
			const parts = url.pathname.split('/').filter(Boolean);
			
			if (parts[1] === 'customer' && parts[3] === 'activity') {
				const customerId = parts[2];
				const activityId = parts[4];
				
				if (customerId && activityId) {
					try {
						// Get the activity DO using the hex ID directly
						const activityDO = env.ACTIVITIES.get(
							env.ACTIVITIES.idFromName(activityId)
						);

						return await activityDO.fetch(request);
					} catch (err) {
						console.error('Activity DO error:', err);
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
			
			const { id: activityId } = await response.json();
			
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
