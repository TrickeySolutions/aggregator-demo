interface TurnstileVerifyResponse {
    success: boolean;
    challenge_ts: string;
    hostname: string;
    'error-codes': string[];
    action?: string;
    cdata?: string;
}

export async function verifyTurnstileToken(env: Env, token: string): Promise<TurnstileVerifyResponse> {
    console.log('[Turnstile] Starting verification');
    
    if (!env.TURNSTILE_SECRET_KEY) {
        console.error('[Turnstile] Secret key not found in environment');
        throw new Error('Turnstile configuration error');
    }
    
    try {
        const formData = new URLSearchParams();
        formData.append('secret', env.TURNSTILE_SECRET_KEY);
        formData.append('response', token);

        console.log('[Turnstile] Sending verification request');
        const verifyResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        const responseText = await verifyResponse.text();
        console.log('[Turnstile] Raw response:', responseText);

        if (!verifyResponse.ok) {
            console.error('[Turnstile] HTTP error:', verifyResponse.status, responseText);
            throw new Error('Failed to verify security token');
        }

        const result = JSON.parse(responseText) as TurnstileVerifyResponse;
        console.log('[Turnstile] Verification result:', result);
        
        if (!result.success) {
            console.error('[Turnstile] Verification failed:', result['error-codes']);
            throw new Error(`Security verification failed: ${result['error-codes'].join(', ')}`);
        }

        return result;
    } catch (error) {
        console.error('[Turnstile] Verification error:', error);
        throw error;
    }
} 