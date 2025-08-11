const mongoose = require('mongoose');
require('dotenv').config({ path: './config.env' });

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    if (this.connection) return this.connection;

    const uri =
      process.env.MONGODB_URI ||
      `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'inventory_service'}`;

    const options = {
      autoIndex: true,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      family: 4
    };

    try {
      this.connection = await mongoose.connect(uri, options);

      mongoose.connection.on('error', (err) => {
        console.error('❌ [Inventory Service] MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ [Inventory Service] MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 [Inventory Service] MongoDB reconnected');
      });

      console.log('✅ [Inventory Service] MongoDB connected');
      return this.connection;
    } catch (error) {
      console.error('❌ [Inventory Service] MongoDB failed to connect:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
      console.log('🔌 [Inventory Service] MongoDB disconnected');
    }
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

module.exports = new Database();


