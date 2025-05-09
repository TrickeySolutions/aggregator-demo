import { ActivitySubmissionMessage, PartnerQuoteMessage } from '../types/messages';
import { Env } from '../index';

export async function handleActivitySubmission(message: ActivitySubmissionMessage, env: Env) {
    console.log('[AS Workflow] Activity Submission Started');
    console.log('[AS Workflow] Processing activity:', message.activityId);
    
    // Step 1: Validate Submission Data
    console.log('[AS Workflow] Step 1: Validating submission data...');
    //await simulateStep();
    
    // Step 2: Get Partners
    console.log('[AS Workflow] Step 2: Getting partners...');
    const partners = ['partner1', 'partner2', 'partner3', 'partner4', 'partner5'];
    //await simulateStep();
    
    // Step 3: Filter Partners
    console.log('[AS Workflow] Step 3: Filtering partners...');
    //await simulateStep();
    
    // Step 4: Queue Partners
    console.log('[AS Workflow] Step 4: Queueing partner requests...');
    for (const partnerId of partners) {
        const partnerMessage: PartnerQuoteMessage = {
            activityId: message.activityId,
            partnerId,
            quoteData: {
                // Include relevant data from message.formData
                partnerSpecificData: `Data for ${partnerId}`,
                formData: message.formData
            }
        };
        
        console.log(`[AS Workflow] Queueing request for partner: ${partnerId}`);
        await env.PARTNER_QUOTES_QUEUE.send(partnerMessage);
    }
    //await simulateStep();
    
    // Step 5: Update Status
    console.log('[AS Workflow] Step 5: Updating activity status to getting_quotes...');
    const activityId = env.ACTIVITIES.idFromString(message.activityId);
    const activity = env.ACTIVITIES.get(activityId);
    
    await activity.fetch(new Request('http://dummy', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: 'getting_quotes'
        })
    }));
    
    await simulateStep();
    
    console.log('[AS Workflow] Activity submission workflow completed');
}

// Helper to simulate processing time
async function simulateStep(minMs = 500, maxMs = 1500) {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
} 