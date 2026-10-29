# Issuer Key Rotation Procedure

How to rotate the signer that holds `ISSUER_ROLE` on the deployed
`VeriSkillCredential` contract. The contract uses OpenZeppelin
`AccessControl`, so rotation is a grant-then-revoke on-chain + env-var swap
on the backend. No contract redeploy is required.

Scope: this document covers the **issuer signer** used by the backend to
mint and update credentials. Admin / revoker / updater rotation follows
the same pattern against their respective roles.

---

## Roles involved

| Role                 | Env var                      | What it signs                                   |
| -------------------- | ---------------------------- | ----------------------------------------------- |
| `DEFAULT_ADMIN_ROLE` | *(off-platform, see below)*  | `grantRole` / `revokeRole` calls                |
| `ISSUER_ROLE`        | `ISSUER_PRIVATE_KEY`         | `mint`, `updateLayer` from the backend          |
| `REVOKER_ROLE`       | *(same signer as admin today)* | `revoke` (lifecycle, not transfer)              |
| `UPDATER_ROLE`       | `ADMIN_PRIVATE_KEY` (optional) | Reserved for operational metadata updates     |

Addresses are set at deploy time via `CONTRACT_ADMIN_ADDRESS`,
`ISSUER_ADDRESS`, `UPDATER_ADDRESS` (see
`packages/contracts/scripts/deploy.ts`). The admin key is **not** stored
in the backend env — it must be held off-platform (hardware wallet or
dedicated signer the operations lead controls) so a backend compromise
cannot grant itself new roles.

---

## When to rotate

Rotate the issuer key when any of these happens:

1. **Suspected compromise** — leaked env file, lost laptop, unauthorised
   deploy. Rotate immediately; treat the old key as burned.
2. **Personnel change** — the engineer who provisioned the key leaves,
   even if there's no evidence of leak.
3. **Scheduled rotation** — every 180 days for the pilot, 90 days once
   on mainnet.
4. **Role scope change** — adding a second issuer, splitting mint vs.
   updater duties.

If compromise is only suspected, follow the "emergency" column — do not
wait for a maintenance window.

---

## Procedure

### 1. Generate the new signer (off-platform)

Create a fresh EOA. Keep the private key only in the target secret store
(Render env vars for the pilot; a KMS / hardware wallet before mainnet).
Record the new address — you'll need it in step 2.

```
# Any ethers / cast / web3 setup; never commit output.
```

### 2. Grant `ISSUER_ROLE` to the new address *before* revoking the old

From the admin signer, call:

```solidity
grantRole(ISSUER_ROLE, <new issuer address>)
```

`ISSUER_ROLE` is `keccak256("ISSUER_ROLE")` — see
`VeriSkillCredential.sol`. Confirm the `RoleGranted` event lands before
proceeding. There is now a window in which both signers can mint; this
is intentional — it lets you cut over without downtime.

### 3. Deploy the new key to the backend

Update `ISSUER_PRIVATE_KEY` in the Render dashboard (both the
`veriskill-backend` web service and the `veriskill-worker` service) and
trigger a restart. The backend reads the env on boot — a rolling restart
is enough; no code change is required.

Smoke test: mint one test credential from the deployed backend. Verify
the on-chain `CredentialMinted` event shows `msg.sender == <new issuer
address>`.

### 4. Revoke `ISSUER_ROLE` from the old address

Once the smoke test is clean, from the admin signer:

```solidity
revokeRole(ISSUER_ROLE, <old issuer address>)
```

Confirm the `RoleRevoked` event. The old key is now powerless on this
contract. Delete it from any secret store it was ever stored in.

### 5. Post-rotation checks

- `hasRole(ISSUER_ROLE, <old>)` returns `false`.
- `hasRole(ISSUER_ROLE, <new>)` returns `true`.
- Backend health check passes (`/health`).
- One real credential mints end-to-end through the API.
- Audit log entry recorded (manual or via `AuditLog` model) with
  rotation reason, operator, timestamps for grant and revoke.

### 6. Communicate

Notify anyone who had the old key that it is retired. If the rotation
was triggered by suspected compromise, also notify any party that
received credentials signed by the old key during the suspected window
— their trust score source is unchanged (the contract state is intact),
but the authentication story around who signed may need review.

---

## Emergency variant (suspected compromise)

Collapse steps 2–4 into one sequence, done by the admin without waiting
for a maintenance window:

1. `revokeRole(ISSUER_ROLE, <old>)` **first** — stop the bleeding.
2. Pause the backend (`veriskill-backend` → stop on Render) so queued
   mint jobs don't fail noisily.
3. Generate new key, `grantRole(ISSUER_ROLE, <new>)`.
4. Set `ISSUER_PRIVATE_KEY` on both Render services, restart.
5. Resume the backend. Audit the mint events during the suspected
   compromise window for anything the attacker may have issued.

The order (revoke-first) is deliberate: brief downtime is cheaper than
letting a compromised key keep minting.

---

## Authorisation

- **Standard rotation**: operations lead approves; executed by any
  engineer with admin-signer access.
- **Emergency rotation**: any engineer with admin-signer access may act
  unilaterally and must notify the operations lead within 1 hour.

If `DEFAULT_ADMIN_ROLE` itself is suspected compromised, this document
does not cover recovery — admin rotation is the same `grantRole` /
`revokeRole` pattern against `DEFAULT_ADMIN_ROLE`, but losing the only
admin signer is unrecoverable by design. Hold the admin key accordingly.

---

## What this document is not

- Not a replacement for a secrets-manager runbook. It assumes you already
  have a procedure for *where* the new key is stored; it only covers the
  on-chain and backend-level steps.
- Not a mainnet-ready HSM / multisig procedure. The pilot runs with a
  single admin EOA. Before mainnet, migrate `DEFAULT_ADMIN_ROLE` to a
  multisig (Safe) and update step 2 and step 4 to go through the
  multisig flow — the on-chain function calls do not change.
