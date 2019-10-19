import { encode } from 'mdurl'
import { Comparison, Logical, LogicalOperator, Expression, Value } from './types'

export * from './types'

function containsRsqlReservedCharacter(value: string): boolean {
  return /["'();,=!~<> ]/.test(value)
}

function rsqlEscape(value: string): string {
  const doubleQuotes = (value.match(/["]/g) || []).length
  const singleQuotes = (value.match(/[']/g) || []).length

  const quoteChar = doubleQuotes >= singleQuotes ? "'" : '"'
  return quoteChar + value.split(quoteChar).join('\\' + quoteChar) + quoteChar
}

function toRsqlValue(value: Value | Value[]): string {
  if (Array.isArray(value)) {
    return `(${value.map(toRsqlValue).join()})`
  }

  // On the serverside no empty string does not exists and gets parsed as 'null'
  if (value === null || value === '') {
    return "''"
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString()
  }

  return containsRsqlReservedCharacter(value) ? rsqlEscape(value) : value
}

export function build(node: Expression): string {
  const value = buildReadable(node)
  return encode(value, encode.componentChars + '=:,;"\'<>#', false)
}

export function buildReadable(node: Expression): string {
  return (node as Logical).operator
    ? buildRsqlFromComplexNode(node as Logical)
    : buildRsqlFromSimpleNode(node as Comparison)
}

function buildRsqlFromSimpleNode(comparison: Comparison): string {
  return (
    toRsqlValue(comparison.selector) + comparison.comparison + toRsqlValue(comparison.arguments)
  )
}

function buildRsqlFromComplexNode({ operator, operands }: Logical): string {
  return operands
    .map(child => getChildRsql(operator === LogicalOperator.And && operands.length > 1, child))
    .join(operator === LogicalOperator.Or ? ',' : ';')
}

/**
 * Transforms a node to rsql, and wraps it in brackets if needed.
 *
 * Brackets are needed if the precedence of the operator in the subtree has lower precedence than the operator of the parent.
 * The rsql comparison operators all have higher precedence than the AND and OR operators so a simple node never
 * needs to be wrapped.
 * The OR operator has lower precedence than the AND operator so an OR node with more than one operand and an
 * AND parent needs to be wrapped.
 *
 * @param perhapsWrap The child node may need to be wrapped
 * @param node the child node to transform to rsql
 * @returns {string}
 */
function getChildRsql(perhapsWrap: boolean, node: Expression): string {
  const rsql = buildReadable(node)
  if ((node as Logical).operands && (node as Logical).operands.length === 1) {
    // Skip this node, render the only child node
    return getChildRsql(perhapsWrap, (node as Logical).operands[0])
  }
  if (perhapsWrap && (node as Logical).operator === 'OR') {
    if ((node as Logical).operands.length > 1) {
      return `(${rsql})`
    }
  }
  return rsql
}
