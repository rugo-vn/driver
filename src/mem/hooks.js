import { path } from 'ramda';
import hash from 'object-hash';

import { ValidationError } from '../exception.js';
import { RugoException } from '@rugo-vn/service';

export const before = {
  async all (args) {
    const name = path(['schema', '_name'], args);
    if (!name) { throw new RugoException(`Schema ${args.schema ? '_name ' : ''}is not defined.`); }

    const { schema } = args;

    const hashed = hash(schema);

    // indexes
    args.uniques = schema._uniques || [];
    args.indexes = schema._indexes || [];

    // clean
    for (const key in schema) {
      if (key[0] === '_') { delete schema[key]; }
    }

    const register = this.registers[name] || {};
    if (register.hashed !== hashed) {
      register.name = name;
      register.hashed = hashed;
      register.collection = await this.createCollection(name);

      this.registers[name] = register;
    }

    args.register = register;
    args.collection = register.collection;
  }
};

export const error = {
  all (originErr) {
    if (Array.isArray(originErr)) {
      const errors = [];

      for (const raw of originErr) {
        switch (raw.keyword) {
          // non-nested
          case 'required':
            errors.push(new ValidationError(`Required value for properties "${raw.params.missingProperty}"`));
            break;

          case 'minimum':
          case 'maximum':
            errors.push(new ValidationError(`Value ${raw.value} is out of ${raw.keyword} range ${raw.params.limit}`));
            break;

          default:
            errors.push(new ValidationError(`Document failed validation in operation "${raw.keyword}"`));
        }
      }

      throw errors;
    }
  }
};
