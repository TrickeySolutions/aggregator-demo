export class PartnerDO {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request) {
    return new Response('Partner DO - Not implemented yet');
  }
} 