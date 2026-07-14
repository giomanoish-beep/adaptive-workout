import { domainError, failure, success, type DomainResult } from './errors.js';

declare const versionIdentifierBrand: unique symbol;

export type VersionIdentifier<Kind extends string> = string & {
  readonly [versionIdentifierBrand]: Kind;
};

export type ContractVersion = VersionIdentifier<'contract'>;
export type EngineVersion = VersionIdentifier<'engine'>;
export type RuleSetVersion = VersionIdentifier<'rule-set'>;

const versionPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/i;
const maximumVersionLength = 64;

export function parseVersionIdentifier<Kind extends string>(
  value: string,
  kind: Kind,
): DomainResult<VersionIdentifier<Kind>, 'VALIDATION_ERROR'> {
  if (value.length > maximumVersionLength || !versionPattern.test(value)) {
    return failure(
      domainError('VALIDATION_ERROR', `Invalid ${kind} version.`, {
        kind,
        maximumLength: maximumVersionLength,
        allowedFormat: 'letters, numbers, dots, underscores, and hyphens',
      }),
    );
  }

  return success(value as VersionIdentifier<Kind>);
}

export interface VersionedContract<Payload> {
  readonly contractVersion: ContractVersion;
  readonly payload: Payload;
}

export interface DeterministicEngineVersion {
  readonly engineName: string;
  readonly engineVersion: EngineVersion;
  readonly ruleSetVersion: RuleSetVersion;
}
