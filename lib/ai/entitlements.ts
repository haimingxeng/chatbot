import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

const REGULAR_USER_MAX_MESSAGES_PER_HOUR = Number(
  process.env.REGULAR_USER_MAX_MESSAGES_PER_HOUR ?? 100
);

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxMessagesPerHour: 10,
  },
  regular: {
    maxMessagesPerHour: REGULAR_USER_MAX_MESSAGES_PER_HOUR,
  },
};
