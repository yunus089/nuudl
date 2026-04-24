import { closeStorePersistence, persistStoreSnapshot, resolveStorePersistence } from "./store-persistence.js";
import { loadPersistedStore, recoverBackofficeOwner } from "./store.js";

const args = process.argv.slice(2);
const CONFIRM_FLAG = "--confirm-break-glass";

const getArgValue = (name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
};

const hasFlag = (name: string) => args.includes(name);

const printUsage = () => {
  process.stderr.write(
    [
      "Backoffice break-glass recovery promotes or restores exactly one operator as owner.",
      "",
      "Usage:",
      `  npm run backoffice:break-glass -- --owner-id owner-root ${CONFIRM_FLAG}`,
      "",
      "Options:",
      "  --owner-id <id>          Backoffice operator id to restore. Falls back to NUUDL_BACKOFFICE_ID.",
      "  --display-name <name>    Optional display name for the restored owner.",
      "  --reason <text>          Audit reason. Defaults to a manual recovery note.",
      "  --dry-run                Show what would change without writing the snapshot.",
      "  --keep-sessions          Keep existing backoffice sessions. Default resets sessions for this owner.",
      `  ${CONFIRM_FLAG}    Required for writes.`,
      "",
      "Run while the API is stopped or immediately restart/redeploy the API after the script.",
    ].join("\n") + "\n",
  );
};

const normalizeOwnerId = (value: string | undefined) => value?.trim() ?? "";

const assertOwnerId = (ownerId: string) => {
  if (!ownerId) {
    throw new Error("Missing owner id. Pass --owner-id <id> or set NUUDL_BACKOFFICE_ID.");
  }

  if (!/^[a-zA-Z0-9_.:-]{3,80}$/.test(ownerId)) {
    throw new Error("Invalid owner id. Use 3-80 chars: letters, numbers, _, ., :, or -.");
  }
};

const main = async () => {
  if (hasFlag("--help") || hasFlag("-h")) {
    printUsage();
    return;
  }

  const dryRun = hasFlag("--dry-run");
  const confirmed =
    hasFlag(CONFIRM_FLAG) || process.env.BACKOFFICE_BREAK_GLASS_CONFIRM?.trim().toLowerCase() === "true";

  if (!dryRun && !confirmed) {
    printUsage();
    throw new Error(`Refusing to write without ${CONFIRM_FLAG}.`);
  }

  const ownerId = normalizeOwnerId(getArgValue("--owner-id") || process.env.NUUDL_BACKOFFICE_ID);
  assertOwnerId(ownerId);

  const displayName = getArgValue("--display-name")?.trim() || undefined;
  const reason = getArgValue("--reason")?.trim() || "Manual break-glass owner recovery.";
  const storageBefore = resolveStorePersistence();
  const store = await loadPersistedStore();
  const result = recoverBackofficeOwner(store, {
    actorId: "break-glass-script",
    displayName,
    ownerId,
    reason,
    resetSessions: !hasFlag("--keep-sessions"),
  });

  if (!dryRun) {
    await persistStoreSnapshot(store);
  }

  const storageAfter = resolveStorePersistence();
  const output = {
    ok: true,
    dryRun,
    ownerId,
    action: result.action,
    role: result.user.role,
    disabled: Boolean(result.user.disabledAt),
    displayName: result.user.displayName,
    activeOwnerCountBefore: result.activeOwnerCountBefore,
    activeOwnerCountAfter: result.activeOwnerCountAfter,
    previousRole: result.previousUser?.role ?? null,
    previousDisabledAt: result.previousUser?.disabledAt ?? null,
    resetSessions: !hasFlag("--keep-sessions"),
    removedSessionCount: result.removedSessions.length,
    auditLogId: result.auditLog.id,
    backofficeActionId: result.backofficeAction.id,
    storage: {
      activeDriver: storageAfter.activeDriver,
      database: storageAfter.database,
      requestedDriver: storageAfter.requestedDriver,
      warning: storageAfter.warning,
      wasActiveDriver: storageBefore.activeDriver,
    },
    nextSteps: dryRun
      ? [`Run again with ${CONFIRM_FLAG} to write the recovery.`]
      : [
          "Restart or redeploy the API so the in-memory runtime reloads the recovered store.",
          "Open the Admin app with the same NUUDL_BACKOFFICE_ID.",
          "If the browser still has a revoked session cookie, clear the Admin site cookie or use a fresh browser.",
          "Verify /admin/backoffice/session returns user.role=owner and authMode=trusted_proxy_session on real domains.",
        ],
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeStorePersistence();
  });
