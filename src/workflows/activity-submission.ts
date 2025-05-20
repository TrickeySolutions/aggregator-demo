import { Env } from '../index';
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

// Define the input parameters for the workflow
export interface ActivitySubmissionParams {
    activityId: string;
    formData: any;
}

// Define the result type
export interface ActivitySubmissionResult {
    success: boolean;
    activityId: string;
    timestamp: number;
    message?: string;
}

export class ActivitySubmissionWorkflow extends WorkflowEntrypoint<Env, ActivitySubmissionParams> {
    async run(event: WorkflowEvent<ActivitySubmissionParams>, step: WorkflowStep): Promise<ActivitySubmissionResult> {
        const { activityId, formData } = event.payload;
        console.log('[AS Workflow] Activity Submission Started');

        // Step 1: Validate Submission Data
        const validationResult = await step.do(
            'validate-submission',
            {
                retries: { limit: 2, delay: '3 seconds', backoff: 'exponential' }
            },
            async () => {
                console.log('[AS Workflow] Step 1: Validating submission data...');
                return !!formData && typeof formData === 'object';
            }
        );

        // Update status to getting_quotes immediately after validation
        await step.do(
            'update-status',
            {
                retries: { limit: 2, delay: '1 second', backoff: 'exponential' }
            },
            async () => {
                const activityId = this.env.ACTIVITIES.idFromString(event.payload.activityId);
                const activityDO = this.env.ACTIVITIES.get(activityId);
                
                await activityDO.fetch(new Request('http://dummy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'getting_quotes'
                    })
                }));
                return true;
            }
        );

        // Step 2: Get Partners and queue them
        //pick a random number of aprtners between 5 and 100 to send quotes to
        const partnerCount = Math.floor(Math.random() * (45 - 5 + 1)) + 5; // Random number between 5 and 100
        const partners = Array.from({ length: partnerCount }, () => 
            crypto.randomUUID() // Generates a GUID/UUID
        );
        
        // Set expected partner count before queueing
        await step.do(
            'set-partner-count',
            {
                retries: { limit: 2, delay: '1 second', backoff: 'exponential' }
            },
            async () => {
                const activityId = this.env.ACTIVITIES.idFromString(event.payload.activityId);
                const activityDO = this.env.ACTIVITIES.get(activityId);
                
                await activityDO.fetch(new Request('http://dummy/api/update-state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        expectedPartnerCount: partners.length
                    })
                }));
                return true;
            }
        );

        // Process partners with direct workflow creation and queue fallback
        await step.do(
            'process-partners',
            {
                retries: { limit: 2, delay: '1 second', backoff: 'exponential' }
            },
            async () => {
                // Create all workflows in parallel
                const promises = partners.map(partnerId => {
                    const partnerParams = {
                        activityId: event.payload.activityId,
                        partnerId,
                        quoteData: {
                            partnerSpecificData: `Data for ${partnerId}`,
                            formData: event.payload.formData
                        }
                    };
                    
                    return this.ctx.waitUntil((async () => {
                        try {
                            // Try direct workflow creation first
                            await this.env.PARTNER_QUOTE_WORKFLOW.create({
                                params: partnerParams
                            });
                            console.log(`[AS Workflow] Created workflow for partner ${partnerId}`);
                        } catch (error) {
                            // Fall back to queue if direct creation fails
                            console.log(`[AS Workflow] Falling back to queue for ${partnerId}:`, error);
                            await this.env.PARTNER_QUOTES_QUEUE.send(partnerParams);
                        }
                    })());
                });

                // Wait for all partners to be processed
                await Promise.all(promises);
                return true;
            }
        );

        return {
            success: true,
            activityId,
            timestamp: Date.now(),
            message: 'Activity submission processed successfully'
        };
    }
}

export default ActivitySubmissionWorkflow; 