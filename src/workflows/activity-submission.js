import { generateUUID } from '../utils/uuid';

export async function handleActivitySubmission(env, activityId, formData) {
    console.log('[AS Function] Activity Submission Started');
    
    try {
        // Get Activity DO
        const activityDO = env.ACTIVITIES.get(
            env.ACTIVITIES.idFromString(activityId)
        );

        // Update status to getting_quotes
        await activityDO.fetch(new Request('http://dummy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'getting_quotes'
            })
        }));

        // Generate partner IDs
        const partnerCount = Math.floor(Math.random() * (45 - 5 + 1)) + 5;
        const partners = Array.from({ length: partnerCount }, () => 
            crypto.randomUUID()
        );

        // Set expected partner count
        await activityDO.fetch(new Request('http://dummy/api/update-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expectedPartnerCount: partners.length
            })
        }));

        // Process partners in parallel
        const partnerPromises = partners.map(partnerId => {
            const partnerParams = {
                activityId,
                partnerId,
                quoteData: {
                    partnerSpecificData: `Data for ${partnerId}`,
                    formData
                }
            };
            
            return handlePartnerQuote(env, partnerParams);
        });

        // Wait for all partner processes to start
        await Promise.all(partnerPromises);

        return {
            success: true,
            activityId,
            timestamp: Date.now(),
            message: 'Activity submission processed successfully'
        };
    } catch (error) {
        console.error('[AS Function] Error:', error);
        return {
            success: false,
            activityId,
            timestamp: Date.now(),
            message: error.message
        };
    }
} 