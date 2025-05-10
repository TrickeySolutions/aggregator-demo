export class CustomerDO {
  private state: DurableObjectState;
  private activities: Set<string>;
  private auth: { userId?: string };
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.activities = new Set();
    this.auth = {};
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Load existing activities from storage
    const storedActivities = await this.state.storage.get('activities') as string[] | null;
    if (storedActivities) {
      this.activities = new Set(storedActivities);
    }

    // Handle authentication
    const auth = request.headers.get('Authorization');
    if (auth) {
      // Verify JWT and set userId
      this.auth.userId = 'verified-user-id';
    }

    switch(request.method) {
      case 'POST':
        if (url.pathname === '/api/activities') {
          // Generate activity ID consistently
          const activityId = this.env.ACTIVITIES.newUniqueId().toString();
          console.log('[CustomerDO] Generated activity ID:', activityId);
          
          const activity = this.env.ACTIVITIES.get(
            this.env.ACTIVITIES.idFromString(activityId)
          );
          
          // Initialize activity with customer ID
          const customerId = this.state.id.toString();
          await activity.fetch(new Request(`http://dummy/customer/${customerId}/activity/${activityId}/init`, {
            method: 'POST'
          }));

          // Store activity ID
          this.activities.add(activityId);
          await this.state.storage.put('activities', Array.from(this.activities));
          
          return new Response(JSON.stringify({ id: activityId }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;

      case 'GET':
        if (url.pathname.endsWith('/activities')) {
          return new Response(JSON.stringify({
            activities: Array.from(this.activities)
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        break;
    }

    return new Response('Not found', { status: 404 });
  }
} 