import { create } from "@bufbuild/protobuf";
import { NullValue, type Value, ValueSchema } from "@bufbuild/protobuf/wkt";

import {
  ColumnPrimitiveType,
  DatabaseColumnSchema,
  type DatabaseRow,
  DatabaseRowSchema,
  type DatabaseTable,
  DatabaseTableSchema,
  DatabaseValueSchema,
} from "@genstack.js/protocol/model/api/v1/db";

/**
 * ## Column Spec
 *
 * Raw description of a column and a column type.
 */
export type ColumnSpec = {
  index: number;
  name?: string;
  type?: ColumnPrimitiveType;
};

/**
 * Union type of raw primitive values which are returnable from a compliant query.
 */
export type RawPrimitiveValue = string | number | bigint | Uint8Array | boolean | null | undefined;

/**
 * Raw row data is a record of raw primitive values.
 */
export type RawRowData = Record<string, RawPrimitiveValue> | RawPrimitiveValue[];

/**
 * Create table metadata to enclose in a query response.
 *
 * @param identity Local identity assigned to this table info
 * @param table Name of the table
 * @param columns Column specifications
 */
export function createTableInfo(identity: number, table: string | null, columns: ColumnSpec[]): DatabaseTable {
  return create(DatabaseTableSchema, {
    name: table || undefined,
    identity: identity,
    column: columns.map((column, index) => {
      return create(DatabaseColumnSchema, {
        name: column.name,
        ordinal: index,
        type: {
          case: "primitive",
          value: column.type || ColumnPrimitiveType.COLUMN_PRIMITIVE_TYPE_UNSPECIFIED,
        },
      });
    }),
  });
}

/**
 * ## Decode Cell
 *
 * Decode or otherwise coerce a returned database value into a "raw primitive value," which is native to JavaScript.
 * Values are then converted to protobuf-compatible types via `Value`.
 *
 * For guidance about type coercion, see `decodeRow`.
 *
 * @param column Spec for the column which owns this cell.
 * @param cell Cell value to decode or coerce.
 */
export function decodeCell(column: ColumnSpec, cell: any): Value {
  const { name, type, index } = column;

  if (cell === null) {
    return create(ValueSchema, {
      kind: {
        case: "nullValue",
        value: NullValue.NULL_VALUE,
      },
    });
  }
  const columnDiagnostic = () => `{name: ${name}, index: ${index}, type: ${type}}`;

  // if we have a type, use it for guidance during decoding
  if (type) {
    switch (type) {
      case ColumnPrimitiveType.TEXT:
        return create(ValueSchema, {
          kind: {
            case: "stringValue",
            value: `${cell}`,
          },
        });

      case ColumnPrimitiveType.REAL:
      case ColumnPrimitiveType.INTEGER: {
        let value: number;

        // if it's a number, use it directly
        if (typeof cell === "number") {
          value = cell;
        } else if (typeof cell === "bigint") {
          value = Number(cell);
        } else {
          throw new Error(`Failed to safely coerce 'INTEGER' column value to number (column: ${columnDiagnostic()})`);
        }
        return create(ValueSchema, {
          kind: {
            case: "numberValue",
            value,
          },
        });
      }

      case ColumnPrimitiveType.BLOB:
        if (cell instanceof Uint8Array) {
          const b64 = Buffer.from(cell).toString("base64");
          return create(ValueSchema, {
            kind: {
              case: "stringValue",
              value: b64,
            },
          });
        }
        throw new Error(`Failed to safely coerce 'BLOB' column value to Uint8Array (column: ${columnDiagnostic()})`);

      default:
        throw new Error(`Unsupported or unrecognized column type: ${type}`);
    }
  }

  // otherwise, infer the type as best we can
  if (typeof cell === "string") {
    return create(ValueSchema, {
      kind: {
        case: "stringValue",
        value: cell,
      },
    });
  }
  if (typeof cell === "number") {
    return create(ValueSchema, {
      kind: {
        case: "numberValue",
        value: cell,
      },
    });
  }

  throw new Error(`Unsupported cell type, or unhandled type coercion (column: ${columnDiagnostic()})`);
}

/**
 * ## Decode Row
 *
 * Decode raw primitive row data into a structured row descriptor. This is a best-effort method which may end up
 * performing type coercion in lossy circumstances.
 *
 * If column information is available, it is consulted while decoding the row; this includes the column's name
 * (for use in diagnostic messages), and the column's expected or inferred type, which is used to guide the type
 * coercion process.
 *
 * If no column information is available, a best-guess algorithm is applied, which leverages JavaScript's type
 * system to infer a potentially-coerced value.
 *
 * @param table Identity (numeric) of the table we are building rows for.
 * @param ordinal Index (ordinal identity) of this row within a given result set.
 * @param row Raw row data to decode or coerce.
 * @param columns Info about the columns in this row; if unavailable, an empty array should be provided.
 * @returns Structured row descriptor.
 */
export function decodeRow(table: number, ordinal: number, row: RawRowData, columns?: ColumnSpec[]): DatabaseRow {
  return create(DatabaseRowSchema, {
    table,
    ordinal: ordinal,
    value: (Array.isArray(row)
      ? row.map((cell) => ({ name: null, value: cell }))
      : Object.entries(row).map(([name, cell]) => ({ name, value: cell }))
    ).map(({ name, value }, index) => {
      const column = columns?.[index];
      const columnName = column?.name || name;
      const columnType = column?.type || ColumnPrimitiveType.COLUMN_PRIMITIVE_TYPE_UNSPECIFIED;
      return create(DatabaseValueSchema, {
        data: {
          case: "value",
          value: decodeCell(
            {
              ...(column || {}),
              index,
              name: columnName || undefined,
              type: columnType,
            },
            value,
          ),
        },
      });
    }),
  });
}
