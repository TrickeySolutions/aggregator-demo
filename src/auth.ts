import { createAuth0Client } from '@auth0/auth0-spa-js';

export const auth0 = await createAuth0Client({
    domain: 'your-domain.auth0.com',
    clientId: 'your-client-id',
    authorizationParams: {
        redirect_uri: window.location.origin
    }
});

export async function initializeAuth() {
    // Handle redirect from Auth0
    if (location.search.includes('code=')) {
        await auth0.handleRedirectCallback();
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

export async function login() {
    await auth0.loginWithRedirect();
}

export async function logout() {
    await auth0.logout({
        logoutParams: {
            returnTo: window.location.origin
        }
    });
} 