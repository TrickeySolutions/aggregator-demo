interface Env {
    AI: any; // or more specific type if available
    ACTIVITIES: DurableObjectNamespace;
    PARTNERS: DurableObjectNamespace;
    PARTNER_LOGOS: R2Bucket;
    PARTNER_LOGOS_URL: string;
    // ... other bindings
} 