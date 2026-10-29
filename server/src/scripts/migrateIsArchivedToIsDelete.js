require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const collections = await mongoose.connection.db.listCollections().toArray();
  let changed = 0;
  for (const collection of collections) {
    const result = await mongoose.connection.db.collection(collection.name).updateMany(
      { isArchived: { $exists: true } },
      [
        { $set: { isDelete: '$isArchived' } },
        { $unset: 'isArchived' }
      ]
    );
    changed += result.modifiedCount || 0;
  }
  console.log(`Soft-delete field migration complete. Documents updated: ${changed}`);
  await mongoose.disconnect();
}

migrate().catch(async error => {
  console.error('Migration failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
