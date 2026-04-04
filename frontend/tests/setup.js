import '@testing-library/jest-dom';

// Stub VITE env vars for unit tests
global.import = { meta: { env: { VITE_API_URL: 'http://localhost:3001/api' } } };

// Suppress React Router future flag warnings in tests
global.IS_REACT_ACT_ENVIRONMENT = true;
