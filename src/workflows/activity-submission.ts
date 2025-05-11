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
        console.log('[AS Workflow] Processing activity:', activityId);

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

        if (!validationResult) {
            return {
                success: false,
                activityId,
                timestamp: Date.now(),
                message: 'Invalid submission data'
            };
        }

        // Step 2: Get Partners
        const partners = await step.do(
            'get-partners',
            {
                retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' }
            },
            async () => {
                console.log('[AS Workflow] Step 2: Getting partners...');
                return ['partner1', 'partner2', 'partner3', 'partner4', 'partner5'];
            }
        );

        // Step 3: Queue Partners
        await step.do(
            'queue-partners',
            {
                retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' }
            },
            async () => {
                console.log('[AS Workflow] Step 4: Queueing partner requests...');
                for (const partnerId of partners) {
                    const partnerMessage = {
                        activityId,
                        partnerId,
                        quoteData: {
                            partnerSpecificData: `Data for ${partnerId}`,
                            formData
                        }
                    };
                    
                    console.log(`[AS Workflow] Queueing request for partner: ${partnerId}`);
                    await this.env.PARTNER_QUOTES_QUEUE.send(partnerMessage);
                }
                return true;
            }
        );

        // Step 4: Update Status
        const statusUpdate = await step.do(
            'update-status',
            {
                retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' }
            },
            async () => {
                console.log('[AS Workflow] Step 5: Updating activity status to getting_quotes...');
                const activityId = this.env.ACTIVITIES.idFromString(event.payload.activityId);
                const activity = this.env.ACTIVITIES.get(activityId);
                
                const response = await activity.fetch(new Request('http://dummy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        status: 'getting_quotes'
                    })
                }));

                return response.ok;
            }
        );

        console.log('[AS Workflow] Activity submission workflow completed');
        
        return {
            success: statusUpdate,
            activityId,
            timestamp: Date.now(),
            message: statusUpdate ? 'Activity submission processed successfully' : 'Failed to update activity status'
        };
    }
}

export default ActivitySubmissionWorkflow; 