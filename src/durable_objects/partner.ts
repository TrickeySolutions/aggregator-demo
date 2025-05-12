interface PartnerState {
    partnerName: string;
    characteristics: PartnerCharacteristics;
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

    private async generatePartnerName(characteristics: PartnerCharacteristics): Promise<string> {
        // Add some random elements to make each prompt unique
        const randomElements = [
            'quantum', 'neural', 'blockchain', 'AI', 'zero-day', 'matrix', 
            'cipher', 'crypto', 'nexus', 'vertex', 'pulse', 'nova', 'apex',
            'sentinel', 'aegis', 'titan', 'atlas', 'helios', 'kronos'
        ];
        const randomElement = randomElements[Math.floor(Math.random() * randomElements.length)];
        
        // Add a random timestamp to prevent caching
        const timestamp = Date.now();
        
        const prompt = `Generate a unique and memorable name for a cyber insurance company. The company has these traits:
- Risk Appetite: ${characteristics.riskAppetite}
- Pricing Approach: ${characteristics.pricingStrategy}
- Brand Authority: ${characteristics.brandAuthority}/10
- Brand Tone: ${characteristics.brandTone}/10
- Specializes in: ${characteristics.specialization}

Consider these guidelines:
${characteristics.brandTone > 7 ? '- Use wordplay, alliteration, or clever tech puns' : ''}
${characteristics.brandAuthority > 7 ? '- Incorporate elements that suggest established expertise and trust' : ''}
${characteristics.riskAppetite === 'gung-ho' ? '- Use bold, dynamic words that suggest action and innovation' : ''}
${characteristics.pricingStrategy === 'luxury' ? '- Use sophisticated, premium-sounding elements' : ''}
${characteristics.pricingStrategy === 'market-disruptor' ? '- Use modern, disruptive-sounding elements' : ''}

You could incorporate tech-related words like: ${randomElement}

Some example structures (but be creative beyond these):
- [Adjective][Tech Term][Insurance Word]
- [Tech Word][Protection Word]
- [Dynamic Verb][Security Word]
- [Mythological Reference][Tech Term]

Timestamp: ${timestamp}

Return only the company name, nothing else.`;
        
        try {
            const response = await this.env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
                messages: [{ role: 'user', content: prompt }]
            });

            // Clean up the response
            let name = response.response.trim()
                .replace(/["']/g, '')
                .replace(/^(name:|company:|suggested name:)/i, '')
                .trim();

            // Fallback if name is too short or too long
            if (name.length < 3 || name.length > 30) {
                const fallbackParts = {
                    prefixes: ['Cyber', 'Digital', 'Tech', 'Net', 'Data', 'Quantum', 'Smart'],
                    mids: ['Shield', 'Guard', 'Secure', 'Safe', 'Trust', 'Risk', 'Cover'],
                    suffixes: ['Pro', 'Plus', 'Prime', 'Elite', 'Max', 'Core', 'Solutions']
                };
                name = `${fallbackParts.prefixes[Math.floor(Math.random() * fallbackParts.prefixes.length)]}${
                    fallbackParts.mids[Math.floor(Math.random() * fallbackParts.mids.length)]}${
                    fallbackParts.suffixes[Math.floor(Math.random() * fallbackParts.suffixes.length)]}`;
            }

            console.log('[PartnerDO] Generated name with characteristics:', {
                name,
                characteristics
            });
            return name;
        } catch (error) {
            console.error('[PartnerDO] Failed to generate name:', error);
            return 'Digital Insurance Partner';
        }
    }

    private async initializeState() {
        if (!this.partnerState) {
            // Try to load existing state
            const stored = await this.state.storage.get<PartnerState>('state');
            if (stored) {
                console.log('[PartnerDO] Loaded existing partner:', {
                    name: stored.partnerName,
                    characteristics: stored.characteristics
                });
                this.partnerState = stored;
            } else {
                // Generate new characteristics and name
                const characteristics = this.generateCharacteristics();
                const partnerName = await this.generatePartnerName(characteristics);
                this.partnerState = { 
                    partnerName,
                    characteristics 
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

            console.log(`[PartnerDO] ${this.partnerState?.partnerName} processing time: ${processingTime}ms`);
            await new Promise(resolve => setTimeout(resolve, processingTime));
            
            // Adjust price based on pricing strategy
            let basePrice = Math.floor(Math.random() * (10000 - 100 + 1)) + 100;
            const priceMultiplier = this.getPriceMultiplier(characteristics?.pricingStrategy);
            const finalPrice = Math.floor(basePrice * priceMultiplier);

            const quoteResponse = {
                partnerId,
                partnerName: this.partnerState?.partnerName || 'Unknown Partner',
                characteristics: this.partnerState?.characteristics,
                status: 'complete',
                price: finalPrice,
                updatedAt: new Date().toISOString()
            };

            console.log('[PartnerDO] Sending quote response:', quoteResponse);
            return new Response(JSON.stringify(quoteResponse), {
                headers: { 'Content-Type': 'application/json' }
            });
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