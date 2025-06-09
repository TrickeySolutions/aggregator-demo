import { Env } from '../index';

interface PartnerQuoteParams {
    activityId: string;
    partnerId: string;
    quoteData: {
        partnerSpecificData: string;
        formData: Record<string, unknown>;
    };
}

interface PartnerQuoteResult {
    success: boolean;
    activityId: string;
    partnerId: string;
    timestamp: number;
    message: string;
}

export async function handlePartnerQuote(
    env: Env, 
    params: PartnerQuoteParams
): Promise<PartnerQuoteResult> {
    const { activityId, partnerId, quoteData } = params;
    
    console.log('[PQ Function] Processing Started for Partner:', partnerId);
    
    try {
        // Initialize quote in activity state
        const activityDO = env.ACTIVITIES.get(
            env.ACTIVITIES.idFromString(activityId)
        );
        
        await activityDO.fetch(new Request('http://localhost/api/update-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId,
                update: {
                    status: 'processing',
                    updatedAt: new Date().toISOString()
                }
            })
        }));

        // Process with Partner DO
        const partnerDO = env.PARTNERS.get(
            env.PARTNERS.idFromName(partnerId)
        );
        
        const response = await partnerDO.fetch(new Request('http://localhost/api/process-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteData })
        }));

        if (!response.ok) {
            throw new Error(`Partner processing failed: ${await response.text()}`);
        }

        const partnerResponse = await response.json();

        // Update Activity DO with quote result
        await activityDO.fetch(new Request('http://localhost/api/update-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                partnerId,
                update: partnerResponse
            })
        }));

        return {
            success: true,
            activityId,
            partnerId,
            timestamp: Date.now(),
            message: 'Quote processed successfully'
        };
    } catch (error) {
        console.error('[PQ Function] Error:', error);
        return {
            success: false,
            activityId,
            partnerId,
            timestamp: Date.now(),
            message: error instanceof Error ? error.message : 'Unknown error'
        };
    }
} 