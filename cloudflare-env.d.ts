declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENAI_WEBHOOK_SECRET?: string;
    BACKGROUND_WEBHOOK_ENABLED?: string;
    MONITOR_RUNNER_SECRET?: string;
    MONITOR_GOOGLE_SERVICE_ACCOUNT?: string;
    MONITOR_GOOGLE_AUDIENCE?: string;
    MONITOR_SCHEDULER_ACTIVE?: string;
    PRIVATE_MONITOR_RUNNER_ENABLED?: string;
    AUTH_ENABLED?: string;
    AUTH_BASE_URL?: string;
    BETTER_AUTH_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GMAIL_REFRESH_TOKEN?: string;
    AUTH_EMAIL_FROM?: string;
    BILLING_MODE?: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    RAZORPAY_PLAN_SOLO_INR?: string;
    RAZORPAY_PLAN_SOLO_USD?: string;
    RAZORPAY_PLAN_PRO_INR?: string;
    RAZORPAY_PLAN_PRO_USD?: string;
  }
}
