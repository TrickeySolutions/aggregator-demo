export interface ActivitySubmissionMessage {
    activityId: string;
    formData: any;
}

export interface PartnerQuoteMessage {
    activityId: string;
    partnerId: string;
    quoteData: any;
}

export interface ActivityState {
    currentSection: SectionType;
    formData?: {
        [key: string]: any;
    };
    status: 'draft' | 'processing' | 'getting_quotes' | 'completed' | 'error' | 'failed';
    updatedAt: number;
    quotes: {
        [partnerId: string]: {
            partnerName: string;
            status: 'processing' | 'complete' | 'error';
            price?: number;
            updatedAt: string;
        };
    };
    customerId: string;
    expectedPartnerCount?: number;
} 