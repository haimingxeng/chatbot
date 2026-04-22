import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { genSaltSync, hashSync } from "bcrypt-ts";
import { user } from "../lib/db/schema";

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: pnpm tsx scripts/reset-password.ts <email> <new-password>");
  process.exit(1);
}

if (!process.env.POSTGRES_URL) {
  console.error("POSTGRES_URL environment variable is required");
  process.exit(1);
}

const client = postgres(process.env.POSTGRES_URL);
const db = drizzle(client);

async function main() {
  const salt = genSaltSync(10);
  const hashedPassword = hashSync(newPassword, salt);

  const result = await db
    .update(user)
    .set({ password: hashedPassword })
    .where(eq(user.email, email))
    .returning({ id: user.id, email: user.email });

  if (result.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(`Password reset successfully for: ${result[0].email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
