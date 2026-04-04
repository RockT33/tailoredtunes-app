// Test environment variables — must be set before any module imports
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-must-be-32-chars!!';
process.env.STRIPE_SECRET_KEY = 'sk_test_fakekeyfortesting';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_testsecret';
process.env.STRIPE_PRICE_BASIC = 'price_basic_test';
process.env.STRIPE_PRICE_PRO = 'price_pro_test';
process.env.STRIPE_PRICE_PREMIUM = 'price_premium_test';
process.env.TEMPOLOR_API_KEY = 'test-tempolor-key';
process.env.TEMPOLOR_BASE_URL = 'https://api.tempolor.com';
process.env.TEMPOLOR_SONG_MODEL = 'tempolor-song-v2';
process.env.TEMPOLOR_INSTRUMENTAL_MODEL = 'tempolor-instrumental-v2';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.PORT = '3001';
