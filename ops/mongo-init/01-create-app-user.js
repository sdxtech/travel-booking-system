const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME;
const rootPassword = process.env.MONGO_INITDB_ROOT_PASSWORD;
const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!rootUser || !rootPassword || !appUser || !appPassword) {
  throw new Error("MongoDB initialization credentials are required.");
}

const adminDb = db.getSiblingDB("admin");
if (adminDb.auth(rootUser, rootPassword) !== 1) {
  throw new Error("MongoDB root authentication failed during initialization.");
}

db.getSiblingDB("bdtr_prod").createUser({
  user: appUser,
  pwd: appPassword,
  roles: [{ role: "readWrite", db: "bdtr_prod" }],
});
