export class PartnerDO {
  private state: DurableObjectState;
  private env: Env;
  private partnerNames: { [key: string]: string } = {
    'partner1': 'Cyber Shield Insurance',
    'partner2': 'Digital Guard Co',
    'partner3': 'Tech Protect Ltd',
    'partner4': 'Secure Bytes Insurance',
    'partner5': 'Data Defense Partners'
  };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/process-quote') {
      const partnerId = this.state.id.toString();
      const partnerName = this.partnerNames[partnerId] || `Insurance Partner ${partnerId}`;
      
      // Generate a random price between £100 and £10000
      const price = Math.floor(Math.random() * (10000 - 100 + 1)) + 100;

      // Simulate some processing time (1-3 seconds)
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10000 + 1000));

      const quoteResponse = {
        partnerId,
        partnerName,
        status: 'complete',
        price,
        updatedAt: new Date().toISOString()
      };

      return new Response(JSON.stringify(quoteResponse), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
} 