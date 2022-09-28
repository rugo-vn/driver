import fs from 'fs';
import { join, parse } from 'path';

import { RugoError } from '@rugo-vn/service';
import Mime from 'mime';

import { ValidationError } from '../exception.js';
import { FsId } from './fsid.js';
import { DIRECTORY_MIME, generateId } from '../utils.js';
import { ascend, compose, descend, filter, keys, map, mergeDeepLeft, pipe, prop, sortWith, whereEq } from 'ramda';

const get = async function ({ collection, id }) {
  id = FsId(id);
  const idPath = id.toPath();
  const docFullPath = join(this.settings.root, collection, idPath);

  const info = parse(idPath);
  const parentId = FsId.fromPath(info.dir);
  const name = info.base;
  const ext = info.ext;

  if (!fs.existsSync(docFullPath)) {
    throw new RugoError('Doc not found');
  }

  const stats = fs.statSync(docFullPath);
  const isDir = stats.isDirectory();
  const mime = isDir ? DIRECTORY_MIME : Mime.getType(ext);

  return {
    _id: id,
    name,
    mime,
    parent: parentId,
    size: isDir ? 0 : stats.size,
    updatedAt: stats.mtime
  };
};

export const create = async function ({ collection, data = {} }) {
  const parentId = FsId(data.parent);
  const parentPath = parentId.toPath();

  const name = data.name || generateId();

  const id = FsId.fromPath(join(parentPath, name));
  const idPath = id.toPath();

  const docFullPath = join(this.settings.root, collection, idPath);

  // check doc not existed
  if (fs.existsSync(docFullPath)) {
    throw new ValidationError(`Duplicate unique value "${idPath}"`);
  }

  // create container directory
  const parentFullPath = join(this.settings.root, collection, parentPath);
  if (!fs.existsSync(parentFullPath)) {
    fs.mkdirSync(parentFullPath, { recursive: true });
  }

  // create file or directory
  const mime = data.mime;
  if (mime === DIRECTORY_MIME) {
    fs.mkdirSync(docFullPath, { recursive: true });
  } else {
    const fd = fs.openSync(docFullPath, 'w');
    fs.closeSync(fd);
  }

  return get.bind(this)({ collection, id });
};

export const find = async function ({ collection, query = {}, sort, skip, limit }) {
  const isDeepFind = query.parent === undefined && query._id === undefined;

  const parent = FsId(query.parent);
  const parentPath = parent.toPath();
  const parentFullPath = join(this.settings.root, collection, parentPath);

  // root list
  let results = [];

  if (query._id !== undefined) {
    try {
      query._id = FsId(query._id);
      results.push(await get.bind(this)({ collection, id: query._id }));
    } catch (_) {}
  } else {
    const ls = fs.readdirSync(parentFullPath);
    for (const name of ls) {
      const doc = await get.bind(this)({ collection, id: FsId.fromPath(join(parentPath, name)) });
      results.push(doc);
    }
  }

  // sort and query
  delete query.parent;
  const pipeline = [];

  if (sort) {
    pipeline.push(
      sortWith(
        compose(
          map(k => sort[k] === -1 ? descend(prop(k)) : ascend(prop(k))),
          keys
        )(sort)
      )
    );
  }

  pipeline.push(filter(whereEq(query)));
  results = pipe(...pipeline)(results);

  // skip and limit
  skip = parseInt(skip);
  if (isNaN(skip)) {
    skip = 0;
  }

  limit = parseInt(limit);
  if (!isNaN(limit)) {
    limit += skip;
  }

  if (isDeepFind) {
    let cursor = 0;
    while (cursor < results.length) {
      if (!isNaN(limit) && results.length >= limit) {
        return results.splice(skip, limit - skip);
      }

      const doc = results[cursor];
      if (doc.mime !== DIRECTORY_MIME) {
        cursor++;
        continue;
      }

      const nextLimit = limit - results.length;
      const newResults = await find.bind(this)({ collection, query: mergeDeepLeft({ parent: doc._id }, query), sort, limit: nextLimit });

      results = [...results, ...newResults];

      cursor++;
    }
  }

  return isNaN(limit) ? results.splice(skip) : results.splice(skip, limit - skip);
};

export const count = async function ({ collection, query }) {
  return (await find.bind(this)({ collection, query })).length;
};

export const update = async function ({ collection, query = {}, set = {} }) {
  if (Object.keys(set).length === 0) { return 0; }

  const ls = await find.bind(this)({ collection, query });

  let no = 0;
  for (const doc of ls) {
    const newParent = set.parent === undefined ? FsId(doc.parent) : FsId(set.parent);
    const newName = set.name || doc.name;
    const newParentPath = newParent.toPath();

    const id = FsId(doc._id);
    const newId = FsId.fromPath(join(newParentPath, newName));
    const newIdPath = newId.toPath();

    if (newId.toString() === id.toString()) { continue; }

    const newDocFullPath = join(this.settings.root, collection, newIdPath);
    const docFullPath = join(this.settings.root, collection, id.toPath());

    // check doc not existed
    if (fs.existsSync(newDocFullPath)) {
      throw new ValidationError(`Duplicate unique value "${newIdPath}"`);
    }

    // create container directory
    const newParentFullPath = join(this.settings.root, collection, newParentPath);
    if (!fs.existsSync(newParentFullPath)) {
      fs.mkdirSync(newParentFullPath, { recursive: true });
    }

    fs.renameSync(docFullPath, newDocFullPath);
    no++;
  }

  return no;
};

export const remove = async function ({ collection, query = {} }) {
  const ls = await find.bind(this)({ collection, query });

  let no = 0;
  for (const doc of ls) {
    const id = FsId(doc._id);
    const idPath = id.toPath();
    const docFullPath = join(this.settings.root, collection, idPath);

    fs.rmSync(docFullPath, { recursive: true });
    no++;
  }

  return no;
};