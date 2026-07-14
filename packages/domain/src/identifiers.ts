import { domainError, failure, success, type DomainResult } from './errors.js';

declare const domainIdBrand: unique symbol;

export type DomainId<EntityName extends string> = string & {
  readonly [domainIdBrand]: EntityName;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function parseDomainId<EntityName extends string>(
  value: string,
  entityName: EntityName,
): DomainResult<DomainId<EntityName>, 'VALIDATION_ERROR'> {
  if (!isUuid(value)) {
    return failure(
      domainError('VALIDATION_ERROR', `Invalid ${entityName} ID.`, {
        entityName,
        requirement: 'UUID',
      }),
    );
  }

  return success(value.toLowerCase() as DomainId<EntityName>);
}
