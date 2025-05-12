import { Env } from "../index";
import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

// Define the input parameters for the workflow
export interface PartnerQuoteParams {
  activityId: string;
  partnerId: string;
  quoteData: any;
}

// Define the result type
export interface PartnerQuoteResult {
  success: boolean;
  activityId: string;
  partnerId: string;
  timestamp: number;
  message?: string;
}


export class PartnerQuoteWorkflow extends WorkflowEntrypoint<Env, PartnerQuoteParams> {
  async run(event: WorkflowEvent<PartnerQuoteParams>, step: WorkflowStep): Promise<PartnerQuoteResult> {
    const { activityId, partnerId, quoteData } = event.payload;
    
    console.log('[PQ Workflow] Partner Quote Processing Started');
    console.log('[PQ Workflow] Activity ID:', activityId);
    console.log('[PQ Workflow] Partner ID:', partnerId);
    
    // Initialize the quote in activity state
    await step.do(
      'initialize-quote',
      {
        retries: { limit: 2, delay: '2 seconds', backoff: 'exponential' }
      },
      async () => {
        const activityId = this.env.ACTIVITIES.idFromString(event.payload.activityId);
        const activityDO = this.env.ACTIVITIES.get(activityId);
        
        await activityDO.fetch(new Request('http://localhost/api/update-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partnerId: event.payload.partnerId,
            update: {
              status: 'processing',
              updatedAt: new Date().toISOString()
            }
          })
        }));
        return true;
      }
    );
    
    // Step 1: Validate the quote data
    const validationResult = await step.do(
      'validate-quote-data',
      {
        retries: {
          limit: 2,
          delay: '3 seconds',
          backoff: 'exponential',
        },
      },
      async (): Promise<boolean> => {
        console.log('[PQ Workflow] Validating quote data');
        // Simple validation - in a real app, you'd have more complex validation
        return !!quoteData && typeof quoteData === 'object';
      }
    );
    
    if (!validationResult) {
      console.error('[PQ Workflow] Invalid quote data');
      return {
        success: false,
        activityId,
        partnerId,
        timestamp: Date.now(),
        message: 'Invalid quote data'
      };
    }
    
    // Step 2: Process the quote with the Partner DO
    const partnerResult = await step.do(
      'process-with-partner',
      {
        retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' },
      },
      async (): Promise<{ success: boolean; response?: any }> => {
        console.log('[PQ Workflow] Processing with Partner DO');
        
        try {
          const partnerId = this.env.PARTNERS.idFromName(event.payload.partnerId);
          const partnerDO = this.env.PARTNERS.get(partnerId);
          
          const response = await partnerDO.fetch(new Request('http://localhost/api/process-quote', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              quoteData: event.payload.quoteData
            })
          }));
          
          if (!response.ok) {
            throw new Error(`Partner processing failed: ${await response.text()}`);
          }
          
          const partnerResponse = await response.json();
          console.log('[PQ Workflow] Partner response:', partnerResponse);
          
          return { success: true, response: partnerResponse };
        } catch (error) {
          console.error('[PQ Workflow] Partner processing error:', error);
          return { success: false };
        }
      }
    );
    
    if (!partnerResult.success) {
      return {
        success: false,
        activityId,
        partnerId,
        timestamp: Date.now(),
        message: 'Failed to process with partner'
      };
    }
    
    // Step 3: Update the Activity DO with the quote result
    const activityResult = await step.do(
      'update-activity',
      {
        retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' },
      },
      async (): Promise<boolean> => {
        try {
          const activityId = this.env.ACTIVITIES.idFromString(event.payload.activityId);
          const activityDO = this.env.ACTIVITIES.get(activityId);
          
          // Use the partner's response to update the activity
          const response = await activityDO.fetch(new Request('http://localhost/api/update-quote', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              partnerId: event.payload.partnerId,
              update: partnerResult.response  // Use the actual partner response
            })
          }));
          
          if (!response.ok) {
            throw new Error(`Activity update failed: ${await response.text()}`);
          }
          
          return true;
        } catch (error) {
          console.error('[PQ Workflow] Activity update error:', error);
          return false;
        }
      }
    );
    
    console.log('[PQ Workflow] Partner Quote Processing Completed');
    
    return {
      success: activityResult,
      activityId,
      partnerId,
      timestamp: Date.now(),
      message: activityResult ? 'Quote processed successfully' : 'Failed to update activity'
    };
  }
}

export default PartnerQuoteWorkflow; 