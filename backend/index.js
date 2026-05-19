const { app, connectDB } = require('./server');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('API available at /api');
    });
  } catch (err) {
    console.error('Backend startup failed. MongoDB Atlas connection is required before routes start.');
    console.error(err?.message || err);
    process.exit(1);
  }
};

startServer();
