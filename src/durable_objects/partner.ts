interface PartnerState {
    partnerName: string;
    characteristics: PartnerCharacteristics;
    logoUrl?: string;
}

interface PartnerCharacteristics {
    riskAppetite: RiskAppetite;
    pricingStrategy: PricingStrategy;
    brandAuthority: number; // 1-10
    brandTone: number; // 1-10 (serious to playful)
    specialization?: string;
}

// Define possible characteristics
const RISK_APPETITES = [
    'ultra-conservative',
    'risk-averse',
    'balanced',
    'risk-tolerant',
    'aggressive',
    'gung-ho'
] as const;
type RiskAppetite = typeof RISK_APPETITES[number];

const PRICING_STRATEGIES = [
    'premium',
    'competitive',
    'value-focused',
    'market-disruptor',
    'luxury',
    'budget-conscious'
] as const;
type PricingStrategy = typeof PRICING_STRATEGIES[number];

const SPECIALIZATIONS = [
    'denial of service protection',
    'data breach protection',
    'ransomware defense',
    'small business focus',
    'enterprise solutions',
    'IoT security',
    'cloud security',
    'financial sector protection',
    'healthcare cybersecurity',
    'cybersecurity for the public sector',
    'cybersecurity for the education sector',
    'cybersecurity for the energy sector',
    'cybersecurity for the manufacturing sector',
    'cybersecurity for the retail sector',
    
] as const;

interface AIError extends Error {
    cause?: Error;
    name: string;
}

export class PartnerDO {
    private state: DurableObjectState;
    private env: Env;
    private partnerState: PartnerState | null = null;

    constructor(state: DurableObjectState, env: Env) {
        this.state = state;
        this.env = env;
    }

    private generateCharacteristics(): PartnerCharacteristics {
        return {
            riskAppetite: RISK_APPETITES[Math.floor(Math.random() * RISK_APPETITES.length)],
            pricingStrategy: PRICING_STRATEGIES[Math.floor(Math.random() * PRICING_STRATEGIES.length)],
            brandAuthority: Math.floor(Math.random() * 10) + 1,
            brandTone: Math.floor(Math.random() * 10) + 1,
            specialization: SPECIALIZATIONS[Math.floor(Math.random() * SPECIALIZATIONS.length)]
        };
    }

    private isRateLimitError(error: unknown): boolean {
        if (!(error instanceof Error)) return false;
        
        // Check for both standard rate limit and capacity exceeded messages
        return error.message.includes('429') || 
               error.message.toLowerCase().includes('capacity temporarily exceeded') ||
               error.message.includes('3040:');
    }

    private async retryOnRateLimit<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
        const startTime = Date.now();
        const operationName = operation.toString().slice(0, 50) + '...';

        try {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const attemptStartTime = Date.now();
                try {
                    console.log(`[PartnerDO] Attempt ${attempt}/${maxRetries} starting at ${attemptStartTime - startTime}ms`);
                    const result = await operation();
                    console.log(`[PartnerDO] Attempt ${attempt} succeeded after ${Date.now() - attemptStartTime}ms`);
                    return result;
                } catch (error) {
                    const errorTime = Date.now();
                    if (this.isRateLimitError(error)) {
                        const typedError = error as Error;
                        console.log(`[PartnerDO] Rate limit/capacity error on attempt ${attempt} after ${errorTime - attemptStartTime}ms:`, {
                            error: typedError.message,
                            type: typedError.constructor.name,
                            totalTimeMs: errorTime - startTime
                        });

                        if (attempt === maxRetries) {
                            console.error(`[PartnerDO] Final retry attempt failed after ${errorTime - startTime}ms total time`);
                            throw error;
                        }

                        // Random delay between 200ms and 1500ms
                        const delay = 200 + (Math.random() * 1300);
                        console.log(`[PartnerDO] Waiting ${delay.toFixed(0)}ms before attempt ${attempt + 1}`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // Non-rate-limit error
                    const typedError = error as Error;
                    console.error(`[PartnerDO] Non-rate-limit error on attempt ${attempt} after ${errorTime - attemptStartTime}ms:`, {
                        error: typedError.message,
                        type: typedError.constructor.name,
                        totalTimeMs: errorTime - startTime
                    });
                    throw error;
                }
            }
            throw new Error('Retry operation failed');
        } catch (error) {
            const finalError = error as Error;
            console.error('[PartnerDO] All retry attempts failed:', {
                totalTimeMs: Date.now() - startTime,
                error: finalError.message,
                type: finalError.constructor.name
            });
            throw error;
        }
    }

    private async generatePartnerName(): Promise<string> {
        try {
            console.log('[PartnerDO] Starting partner name generation');
            
            if (!this.env.AI) {
                throw new Error('AI binding not available');
            }

            const response = await this.retryOnRateLimit(() => 
                this.env.AI.run(
                    "@cf/meta/llama-2-7b-chat-int8",
                    {
                        messages: [
                            {
                                role: "system",
                                content: "You are a creative assistant that generates plausible insurance company names."
                            },
                            {
                                role: "user",
                                content: "Generate a single plausible name for an insurance company. Only return the name, no explanation or additional text."
                            }
                        ]
                    },
                    {
                        gateway: {
                            id: "aggregator-demo-gateway"
                        }
                    }
                )
            );

            if (!response?.response) {
                console.error('[PartnerDO] Empty AI response:', response);
                throw new Error('Empty response from AI');
            }

            const name = response.response.trim();
            console.log('[PartnerDO] Raw AI response:', { name });

            // Validate the generated name
            if (!this.isValidCompanyName(name)) {
                console.error('[PartnerDO] Invalid name generated:', {
                    name,
                    length: name.length,
                    hasLetter: /[a-zA-Z]/.test(name),
                    startsWithLetter: /^[a-zA-Z]/.test(name),
                    validChars: /^[a-zA-Z0-9\s\-]+$/.test(name)
                });
                throw new Error('Invalid company name generated');
            }

            console.log('[PartnerDO] Successfully generated name:', name);
            return name;

        } catch (error) {
            // Enhanced error logging
            const errorDetails = {
                message: error instanceof Error ? error.message : 'Unknown error',
                type: error instanceof Error ? error.constructor.name : typeof error,
                stack: error instanceof Error ? error.stack : undefined,
                aiBinding: !!this.env.AI,
                gatewayId: "aggregator-demo-gateway"
            };
            
            console.error('[PartnerDO] Name generation failed:', errorDetails);
            
            // Use the fallback name generator instead of just ID
            const fallbackName = this.generateFallbackName();
            console.log('[PartnerDO] Using fallback name:', fallbackName);
            return fallbackName;
        }
    }

    private isValidCompanyName(name: string): boolean {
        // More focused validation
        if (name.length < 2 || name.length > 30) {
            console.log('[PartnerDO] Name length invalid:', name.length);
            return false;
        }
        
        // Must contain at least one letter and be mostly alphanumeric
        if (!/^[a-zA-Z0-9\s\-]+$/.test(name)) {
            console.log('[PartnerDO] Invalid characters in name');
            return false;
        }

        // Must start with a letter
        if (!/^[a-zA-Z]/.test(name)) {
            console.log('[PartnerDO] Name must start with a letter');
            return false;
        }

        return true;
    }

    private generateFallbackName(): string {
        const prefixes = [
            'Cyber', 'Digital', 'Tech', 'Net', 'Data', 'Quantum', 'Smart',
            'Secure', 'Shield', 'Guard', 'Nexus', 'Vertex', 'Nova', 'Prime',
            'Atlas', 'Aegis', 'Titan', 'Matrix', 'Pulse'
        ];
        
        const suffixes = [
            'Shield', 'Guard', 'Secure', 'Safe', 'Trust', 'Risk', 'Cover',
            'Protect', 'Defense', 'Sentinel', 'Solutions', 'Insurance',
            'Security', 'Assurance', 'Protection'
        ];

        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        
        return `${prefix}${suffix}`;
    }

    private async generateAndStoreLogo(partnerName: string, characteristics: PartnerCharacteristics): Promise<string> {
        const logoId = `${this.state.id.toString()}.png`;
        const DEFAULT_LOGO = '/assets/images/default-logo.png';
        const startTime = Date.now();
        
        try {
            console.log('[PartnerDO] Starting logo generation for:', partnerName);
            
            const response = await this.retryOnRateLimit(() => 
                this.env.AI.run(
                    '@cf/black-forest-labs/flux-1-schnell',
                    {
                        prompt: `Professional minimalist business logo for "${partnerName}", a ${characteristics.specialization} insurance company. 
                            Style: ${characteristics.brandTone > 7 ? 'modern and playful' : 'corporate and serious'}, 
                            Brand Authority: ${characteristics.brandAuthority}/10. 
                            Clean vector style, suitable for both dark and light backgrounds.`,
                        num_steps: 20,
                        width: 256,
                        height: 256
                    },
                    {
                        gateway: {
                            id: "aggregator-demo-gateway"
                        }
                    }
                )
            );

            // Handle Flux response format
            let imageData: Uint8Array;
            
            if (response instanceof ReadableStream) {
                // Handle stream response
                const reader = response.getReader();
                const chunks = [];
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
                
                imageData = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
                let position = 0;
                
                for (const chunk of chunks) {
                    imageData.set(chunk, position);
                    position += chunk.length;
                }
            } else if (response && typeof response === 'object' && 'image' in response) {
                // Handle base64 response from Flux
                const base64Data = response.image as string;
                // Remove data URL prefix if present
                const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
                // Convert base64 to binary
                const binaryString = atob(base64Image);
                imageData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    imageData[i] = binaryString.charCodeAt(i);
                }
            } else {
                console.error('[PartnerDO] Unexpected response format:', {
                    type: typeof response,
                    hasImage: 'image' in response,
                    keys: Object.keys(response)
                });
                throw new Error('Invalid response format from AI model');
            }

            // Store in R2
            await this.env.PARTNER_LOGOS.put(logoId, imageData, {
                httpMetadata: {
                    contentType: 'image/png',
                    cacheControl: 'public, max-age=31536000' // Cache for 1 year
                }
            });

            // Use the worker path for logo URL
            const logoUrl = `/partner-logos/${logoId}`;
            console.log('[PartnerDO] Logo generated and stored successfully:', logoUrl);

            return logoUrl;

        } catch (error) {
            const typedError = error as Error;
            console.error('[PartnerDO] Logo generation failed:', {
                partnerId: this.state.id.toString(),
                partnerName,
                error: typedError.message,
                stack: typedError.stack,
                totalTimeMs: Date.now() - startTime,
                wasRateLimitError: typedError.message.includes('429')
            });
            return DEFAULT_LOGO;
        }
    }

    private async initializeState() {
        if (!this.partnerState) {
            const stored = await this.state.storage.get<PartnerState>('state');
            if (stored) {
                console.log('[PartnerDO] Loaded existing partner:', stored.partnerName);
                this.partnerState = stored;
            } else {
                const characteristics = this.generateCharacteristics();
                const partnerName = await this.generatePartnerName();
                const logoUrl = await this.generateAndStoreLogo(partnerName, characteristics);
                
                this.partnerState = { 
                    partnerName, 
                    characteristics,
                    logoUrl 
                };
                
                await this.state.storage.put('state', this.partnerState);
            }
        }
    }

    async fetch(request: Request): Promise<Response> {
        await this.initializeState();
        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/process-quote') {
            const partnerId = this.state.id.toString();
            console.log(`[PartnerDO] Processing quote for: ${this.partnerState?.partnerName}`);
            
            // Calculate processing time based on characteristics
            const characteristics = this.partnerState?.characteristics;
            const baseDelay = 2000; // Base 2 seconds
            let processingTime = baseDelay;

            if (characteristics) {
                // More authoritative partners are faster
                const authorityFactor = 1 - (characteristics.brandAuthority / 10);
                // Risk-averse partners take longer to process
                const riskFactor = this.getRiskProcessingFactor(characteristics.riskAppetite);
                
                processingTime = baseDelay * authorityFactor * riskFactor;
                // Add some randomness (±20%)
                processingTime *= (0.8 + Math.random() * 0.4);
                // Ensure minimum and maximum times
                processingTime = Math.max(1000, Math.min(5000, processingTime));
            }

            console.log(`[PartnerDO] Estimated processing time: ${processingTime}ms`);
            await new Promise(resolve => setTimeout(resolve, processingTime));
            
            // Adjust price based on pricing strategy
            let basePrice = Math.floor(Math.random() * (10000 - 100 + 1)) + 100;
            const priceMultiplier = this.getPriceMultiplier(characteristics?.pricingStrategy);
            const finalPrice = Math.floor(basePrice * priceMultiplier);

            const quoteResponse = {
                partnerId,
                partnerName: this.partnerState?.partnerName || 'Unknown Partner',
                characteristics: this.partnerState?.characteristics,
                logoUrl: this.partnerState?.logoUrl || '/assets/images/default-logo.png',
                status: 'complete',
                price: finalPrice,
                updatedAt: new Date().toISOString()
            };
            console.log('[PartnerDO] Sending quote response:', quoteResponse.partnerName);
            //console.log('[PartnerDO] Sending quote response:', quoteResponse);
            return new Response(JSON.stringify(quoteResponse));
        }

        return new Response('Not found', { status: 404 });
    }

    private getPriceMultiplier(strategy?: PricingStrategy): number {
        switch (strategy) {
            case 'premium': return 1.5;
            case 'competitive': return 1.0;
            case 'value-focused': return 0.8;
            case 'market-disruptor': return 0.7;
            case 'luxury': return 2.0;
            default: return 1.0;
        }
    }

    private getRiskProcessingFactor(appetite?: RiskAppetite): number {
        switch (appetite) {
            case 'ultra-conservative': return 1.5;
            case 'risk-averse': return 1.3;
            case 'balanced': return 1.0;
            case 'risk-tolerant': return 0.8;
            case 'aggressive': return 0.7;
            case 'gung-ho': return 0.5;
            default: return 1.0;
        }
    }
} 