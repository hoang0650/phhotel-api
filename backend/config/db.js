const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();


function mongooseSetup() {
  const mongoOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // 30 seconds
    socketTimeoutMS: 45000, // 45 seconds
    connectTimeoutMS: 30000, // 30 seconds
    maxPoolSize: 10, // Maintain up to 10 socket connections
    minPoolSize: 2, // Maintain at least 2 socket connections
    retryWrites: true,
    retryReads: true
  };

  mongoose.connect(process.env.MDB_CONNECT, mongoOptions)
    .then(() => {
      console.info('Connected to MongoDB successful');
    })
    .catch((err) => {
      console.error('Mongoose connection error:', err);
      // Retry connection after 5 seconds
      setTimeout(() => {
        console.log('Retrying MongoDB connection...');
        mongooseSetup();
      }, 5000);
    });

  mongoose.connection.on('connected', function(){
    console.info('Connected to MongoDB successful');
  })

  mongoose.connection.on('error',function(err){
    console.error('Mongoose default connection has occured ' + err + ' error');
  })

  mongoose.connection.on('disconnected', function(){
    console.warn('Database connection is disconnected');
    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
      if (mongoose.connection.readyState === 0) {
        console.log('Attempting to reconnect to MongoDB...');
        mongooseSetup();
      }
    }, 5000);
  })

  process.on('SIGINT', function(){
    mongoose.connection.close(function(){
        console.log('Database connection is disconnected due to application termination');
        process.exit(0);
    })
  })
}
module.exports = {mongooseSetup};