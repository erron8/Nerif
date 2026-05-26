import { db } from "./client";

await db.run("select 1");
console.log("Database connection ok");
