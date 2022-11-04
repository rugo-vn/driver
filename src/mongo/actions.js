import { RugoException } from '@rugo-vn/service';
import { ObjectId } from 'mongodb';
import { union } from 'ramda';

const buildQuery = ({ query = {}, search, indexes, uniques }) => {
  if (query._id) { query._id = ObjectId(query._id); }
  if (search) {
    query = {
      $and: [
        query,
        {
          $or: union(indexes, uniques)
            .map(v => ({ [v]: { $regex: new RegExp(search, 'i') } }))
        }
      ]
    };
  }

  return query;
};

export const create = async function ({ collection, data }) {
  const res = await collection.insertOne(data);

  if (!res.insertedId) { throw new RugoException('Can not create a doc'); }

  return await collection.findOne({ _id: res.insertedId });
};

export const find = async function (args) {
  const { collection, sort } = args;
  const query = buildQuery(args);
  let { skip, limit } = args;

  // find many
  let queryBuilder = collection.find(query);

  if (sort) {
    queryBuilder = queryBuilder.sort(sort);
  }

  skip = parseInt(skip);
  if (skip) {
    queryBuilder = queryBuilder.skip(parseInt(skip));
  }

  limit = parseInt(limit);
  if (!isNaN(limit)) {
    queryBuilder = queryBuilder.limit(parseInt(limit));
  }

  return await queryBuilder.toArray();
};

export const count = async function (args) {
  const { collection } = args;
  const query = buildQuery(args);

  return await collection.countDocuments(query);
};

export const update = async function ({ collection, query = {}, set, unset, inc }) {
  if (query._id) { query._id = ObjectId(query._id); }

  const res = await collection.updateMany(query, {
    $set: set || {},
    $unset: unset || {},
    $inc: inc || {}
  });

  return res.matchedCount;
};

export const remove = async function ({ collection, query = {} }) {
  if (query._id) { query._id = ObjectId(query._id); }

  const res = await collection.deleteMany(query);

  return res.deletedCount;
};
