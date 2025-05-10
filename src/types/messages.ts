export interface ActivitySubmissionMessage {
    activityId: string;
    formData: any;
}

export interface PartnerQuoteMessage {
    activityId: string;
    partnerId: string;
    quoteData: any;
} 