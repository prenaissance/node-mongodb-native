import { Code, type Document } from '../bson';
import type { Collection } from '../collection';
import type { Db } from '../db';
import { MongoServerError } from '../error';
import { ReadPreference } from '../read_preference';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { CommandOperation, type CommandOperationOptions } from './command';

/** @public */
export interface EvalOptions extends CommandOperationOptions {
  nolock?: boolean;
}

/** @internal */
export class EvalOperation extends CommandOperation<Document> {
  override options: EvalOptions;
  code: Code;
  parameters?: Document | Document[];

  constructor(
    db: Db | Collection,
    code: Code,
    parameters?: Document | Document[],
    options?: EvalOptions
  ) {
    super(db, options);

    this.options = options ?? {};
    this.code = code;
    this.parameters = parameters;
    // force primary read preference
    Object.defineProperty(this, 'readPreference', {
      value: ReadPreference.primary,
      configurable: false,
      writable: false
    });
  }

  override async execute(server: Server, session: ClientSession | undefined): Promise<Document> {
    let finalCode = this.code;
    let finalParameters: Document[] = [];

    // If not a code object translate to one
    if (!(finalCode && (finalCode as unknown as { _bsontype: string })._bsontype === 'Code')) {
      finalCode = new Code(finalCode as never);
    }

    // Ensure the parameters are correct
    if (this.parameters != null && typeof this.parameters !== 'function') {
      finalParameters = Array.isArray(this.parameters) ? this.parameters : [this.parameters];
    }

    // Create execution selector
    const cmd: Document = { $eval: finalCode, args: finalParameters };

    // Check if the nolock parameter is passed in
    if (this.options.nolock) {
      cmd.nolock = this.options.nolock;
    }

    // Execute the command
    const result = await super.executeCommand(server, session, cmd);
    if (result && result.ok === 1) {
      return result.retval;
    }

    if (result) {
      throw new MongoServerError({ message: `eval failed: ${result.errmsg}` });
    }

    return result;
  }
}
