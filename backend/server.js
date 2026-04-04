require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`TailoredTunes API running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
