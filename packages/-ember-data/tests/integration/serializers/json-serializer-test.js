import { underscore } from '@ember/string';
import { run } from '@ember/runloop';
import setupStore from 'dummy/tests/helpers/store';

import testInDebug from 'dummy/tests/helpers/test-in-debug';
import { module, test } from 'qunit';

import DS from 'ember-data';

var Post, Comment, Favorite, env, serializer;

module('integration/serializer/json - JSONSerializer', function(hooks) {
  hooks.beforeEach(function() {
    Post = DS.Model.extend({
      title: DS.attr('string'),
      comments: DS.hasMany('comment', { inverse: null, async: false }),
    });
    Comment = DS.Model.extend({
      body: DS.attr('string'),
      post: DS.belongsTo('post', { inverse: null, async: false }),
    });
    Favorite = DS.Model.extend({
      post: DS.belongsTo('post', { inverse: null, async: true, polymorphic: true }),
    });
    env = setupStore({
      post: Post,
      comment: Comment,
      favorite: Favorite,
    });
    env.store.modelFor('post');
    env.store.modelFor('comment');
    env.store.modelFor('favorite');
    serializer = env.store.serializerFor('-json');
  });

  hooks.afterEach(function() {
    run(env.store, 'destroy');
  });

  test("serialize doesn't include ID when includeId is false", function(assert) {
    let post = env.store.createRecord('post', {
      title: 'Rails is omakase',
      comments: [],
    });
    let json = serializer.serialize(post._createSnapshot(), { includeId: false });

    assert.deepEqual(json, {
      title: 'Rails is omakase',
      comments: [],
    });
  });

  test("serialize doesn't include relationship if not aware of one", function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let json = serializer.serialize(post._createSnapshot());

    assert.deepEqual(json, {
      title: 'Rails is omakase',
    });
  });

  test('serialize includes id when includeId is true', function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase', comments: [] });

    run(() => {
      post.set('id', 'test');
    });

    let json = serializer.serialize(post._createSnapshot(), { includeId: true });

    assert.deepEqual(json, {
      id: 'test',
      title: 'Rails is omakase',
      comments: [],
    });
  });

  test('serializeAttribute', function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let json = {};

    serializer.serializeAttribute(post._createSnapshot(), json, 'title', { type: 'string' });

    assert.deepEqual(json, {
      title: 'Rails is omakase',
    });
  });

  test('serializeAttribute respects keyForAttribute', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForAttribute(key) {
          return key.toUpperCase();
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let json = {};

    env.store
      .serializerFor('post')
      .serializeAttribute(post._createSnapshot(), json, 'title', { type: 'string' });

    assert.deepEqual(json, { TITLE: 'Rails is omakase' });
  });

  test('serializeBelongsTo', function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: '1' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });
    let json = {};

    serializer.serializeBelongsTo(comment._createSnapshot(), json, { key: 'post', options: {} });

    assert.deepEqual(json, { post: '1' });
  });

  test('serializeBelongsTo with null', function(assert) {
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: null });
    let json = {};

    serializer.serializeBelongsTo(comment._createSnapshot(), json, { key: 'post', options: {} });

    assert.deepEqual(
      json,
      {
        post: null,
      },
      'Can set a belongsTo to a null value'
    );
  });

  test('async serializeBelongsTo with null', function(assert) {
    Comment.reopen({
      post: DS.belongsTo('post', { async: true }),
    });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: null });
    let json = {};

    serializer.serializeBelongsTo(comment._createSnapshot(), json, { key: 'post', options: {} });

    assert.deepEqual(
      json,
      {
        post: null,
      },
      'Can set a belongsTo to a null value'
    );
  });

  test('serializeBelongsTo respects keyForRelationship', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForRelationship(key, type) {
          return key.toUpperCase();
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: '1' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });
    let json = {};

    env.store
      .serializerFor('post')
      .serializeBelongsTo(comment._createSnapshot(), json, { key: 'post', options: {} });

    assert.deepEqual(json, {
      POST: '1',
    });
  });

  test('serializeHasMany respects keyForRelationship', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForRelationship(key, type) {
          return key.toUpperCase();
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: '1' });
    let comment = env.store.createRecord('comment', {
      body: 'Omakase is delicious',
      post: post,
      id: '1',
    });

    run(function() {
      post.get('comments').pushObject(comment);
    });

    let json = {};

    env.store
      .serializerFor('post')
      .serializeHasMany(post._createSnapshot(), json, { key: 'comments', options: {} });

    assert.deepEqual(json, {
      COMMENTS: ['1'],
    });
  });

  test('serializeHasMany omits unknown relationships on pushed record', function(assert) {
    let post = run(() =>
      env.store.push({
        data: {
          id: '1',
          type: 'post',
          attributes: {
            title: 'Rails is omakase',
          },
        },
      })
    );
    let json = {};

    env.store
      .serializerFor('post')
      .serializeHasMany(post._createSnapshot(), json, { key: 'comments', options: {} });

    assert.ok(!json.hasOwnProperty('comments'), 'Does not add the relationship key to json');
  });

  test('shouldSerializeHasMany', function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: '1' });
    env.store.createRecord('comment', { body: 'Omakase is delicious', post: post, id: '1' });

    var snapshot = post._createSnapshot();
    var relationship = snapshot.record.relationshipFor('comments');
    var key = relationship.key;

    var shouldSerialize = env.store
      .serializerFor('post')
      .shouldSerializeHasMany(snapshot, relationship, key);

    assert.ok(
      shouldSerialize,
      'shouldSerializeHasMany correctly identifies with hasMany relationship'
    );
  });

  test('serializeIntoHash', function(assert) {
    let post = env.store.createRecord('post', { title: 'Rails is omakase', comments: [] });
    let json = {};

    serializer.serializeIntoHash(json, Post, post._createSnapshot());

    assert.deepEqual(json, {
      title: 'Rails is omakase',
      comments: [],
    });
  });

  test('serializePolymorphicType sync', function(assert) {
    assert.expect(1);

    env.owner.register(
      'serializer:comment',
      DS.JSONSerializer.extend({
        serializePolymorphicType(record, json, relationship) {
          let key = relationship.key;
          let belongsTo = record.belongsTo(key);
          json[relationship.key + 'TYPE'] = belongsTo.modelName;

          assert.ok(
            true,
            'serializePolymorphicType is called when serialize a polymorphic belongsTo'
          );
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: 1 });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    env.store
      .serializerFor('comment')
      .serializeBelongsTo(
        comment._createSnapshot(),
        {},
        { key: 'post', options: { polymorphic: true } }
      );
  });

  test('serializePolymorphicType async', function(assert) {
    assert.expect(1);

    Comment.reopen({
      post: DS.belongsTo('post', { async: true }),
    });

    env.owner.register(
      'serializer:comment',
      DS.JSONSerializer.extend({
        serializePolymorphicType(record, json, relationship) {
          assert.ok(
            true,
            'serializePolymorphicType is called when serialize a polymorphic belongsTo'
          );
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase', id: 1 });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    env.store
      .serializerFor('comment')
      .serializeBelongsTo(
        comment._createSnapshot(),
        {},
        { key: 'post', options: { async: true, polymorphic: true } }
      );
  });

  test('normalizeResponse normalizes each record in the array', function(assert) {
    var postNormalizeCount = 0;
    var posts = [{ id: '1', title: 'Rails is omakase' }, { id: '2', title: 'Another Post' }];

    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        normalize() {
          postNormalizeCount++;
          return this._super.apply(this, arguments);
        },
      })
    );

    run(function() {
      env.store.serializerFor('post').normalizeResponse(env.store, Post, posts, null, 'findAll');
    });
    assert.equal(postNormalizeCount, 2, 'two posts are normalized');
  });

  test('Serializer should respect the attrs hash when extracting records', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: 'title_payload_key',
          comments: { key: 'my_comments' },
        },
      })
    );

    var jsonHash = {
      id: '1',
      title_payload_key: 'Rails is omakase',
      my_comments: [1, 2],
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.equal(post.data.attributes.title, 'Rails is omakase');
    assert.deepEqual(post.data.relationships.comments.data, [
      { id: '1', type: 'comment' },
      { id: '2', type: 'comment' },
    ]);
  });

  test('Serializer should map `attrs` attributes directly when keyForAttribute also has a transform', function(assert) {
    Post = DS.Model.extend({
      authorName: DS.attr('string'),
    });
    env = setupStore({
      post: Post,
    });
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForAttribute: underscore,
        attrs: {
          authorName: 'author_name_key',
        },
      })
    );

    var jsonHash = {
      id: '1',
      author_name_key: 'DHH',
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.equal(post.data.attributes.authorName, 'DHH');
  });

  test('Serializer should respect the attrs hash when serializing records', function(assert) {
    Post.reopen({
      parentPost: DS.belongsTo('post', { inverse: null, async: true }),
    });
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: 'title_payload_key',
          parentPost: { key: 'my_parent' },
        },
      })
    );

    let parentPost = run(() =>
      env.store.push({
        data: {
          type: 'post',
          id: '2',
          attributes: {
            title: 'Rails is omakase',
          },
        },
      })
    );
    let post = env.store.createRecord('post', {
      title: 'Rails is omakase',
      parentPost: parentPost,
    });
    let payload = env.store.serializerFor('post').serialize(post._createSnapshot());

    assert.equal(payload.title_payload_key, 'Rails is omakase');
    assert.equal(payload.my_parent, '2');
  });

  test('Serializer respects if embedded model has an attribute named "type" - #3726', function(assert) {
    env.owner.register('serializer:child', DS.JSONSerializer);
    env.owner.register(
      'serializer:parent',
      DS.JSONSerializer.extend(DS.EmbeddedRecordsMixin, {
        attrs: {
          child: { embedded: 'always' },
        },
      })
    );
    env.owner.register(
      'model:parent',
      DS.Model.extend({
        child: DS.belongsTo('child'),
      })
    );
    env.owner.register(
      'model:child',
      DS.Model.extend({
        type: DS.attr(),
      })
    );

    var jsonHash = {
      id: 1,
      child: {
        id: 1,
        type: 'first_type',
      },
    };

    var Parent = env.store.modelFor('parent');
    var payload = env.store
      .serializerFor('parent')
      .normalizeResponse(env.store, Parent, jsonHash, '1', 'findRecord');
    assert.deepEqual(payload.included, [
      {
        id: '1',
        type: 'child',
        attributes: {
          type: 'first_type',
        },
        relationships: {},
      },
    ]);
  });

  test('Serializer respects if embedded model has a relationship named "type" - #3726', function(assert) {
    env.owner.register('serializer:child', DS.JSONSerializer);
    env.owner.register(
      'serializer:parent',
      DS.JSONSerializer.extend(DS.EmbeddedRecordsMixin, {
        attrs: {
          child: { embedded: 'always' },
        },
      })
    );
    env.owner.register(
      'model:parent',
      DS.Model.extend({
        child: DS.belongsTo('child'),
      })
    );
    env.owner.register(
      'model:child',
      DS.Model.extend({
        type: DS.belongsTo('le-type'),
      })
    );
    env.owner.register('model:le-type', DS.Model.extend());

    var jsonHash = {
      id: 1,
      child: {
        id: 1,
        type: 'my_type_id',
      },
    };

    var Parent = env.store.modelFor('parent');
    var payload = env.store
      .serializerFor('parent')
      .normalizeResponse(env.store, Parent, jsonHash, '1', 'findRecord');
    assert.deepEqual(payload.included, [
      {
        id: '1',
        type: 'child',
        attributes: {},
        relationships: {
          type: {
            data: {
              id: 'my_type_id',
              type: 'le-type',
            },
          },
        },
      },
    ]);
  });

  test('Serializer respects `serialize: false` on the attrs hash', function(assert) {
    assert.expect(2);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: { serialize: false },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let payload = env.store.serializerFor('post').serialize(post._createSnapshot());

    assert.ok(!payload.hasOwnProperty('title'), 'Does not add the key to instance');
    assert.ok(
      !payload.hasOwnProperty('[object Object]'),
      'Does not add some random key like [object Object]'
    );
  });

  test('Serializer respects `serialize: false` on the attrs hash for a `hasMany` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          comments: { serialize: false },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    var serializer = env.store.serializerFor('post');
    var serializedProperty = serializer.keyForRelationship('comments', 'hasMany');

    var payload = serializer.serialize(post._createSnapshot());
    assert.ok(!payload.hasOwnProperty(serializedProperty), 'Does not add the key to instance');
  });

  test('Serializer respects `serialize: false` on the attrs hash for a `belongsTo` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:comment',
      DS.JSONSerializer.extend({
        attrs: {
          post: { serialize: false },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    var serializer = env.store.serializerFor('comment');
    var serializedProperty = serializer.keyForRelationship('post', 'belongsTo');

    var payload = serializer.serialize(comment._createSnapshot());
    assert.ok(!payload.hasOwnProperty(serializedProperty), 'Does not add the key to instance');
  });

  test('Serializer respects `serialize: false` on the attrs hash for a `hasMany` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          comments: { serialize: false },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    var serializer = env.store.serializerFor('post');
    var serializedProperty = serializer.keyForRelationship('comments', 'hasMany');

    var payload = serializer.serialize(post._createSnapshot());
    assert.ok(!payload.hasOwnProperty(serializedProperty), 'Does not add the key to instance');
  });

  test('Serializer respects `serialize: false` on the attrs hash for a `belongsTo` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:comment',
      DS.JSONSerializer.extend({
        attrs: {
          post: { serialize: false },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    var serializer = env.store.serializerFor('comment');
    var serializedProperty = serializer.keyForRelationship('post', 'belongsTo');

    var payload = serializer.serialize(comment._createSnapshot());
    assert.ok(!payload.hasOwnProperty(serializedProperty), 'Does not add the key to instance');
  });

  test('Serializer respects `serialize: true` on the attrs hash for a `hasMany` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          comments: { serialize: true },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    run(function() {
      post.get('comments').pushObject(comment);
    });

    var serializer = env.store.serializerFor('post');
    var serializedProperty = serializer.keyForRelationship('comments', 'hasMany');

    var payload = serializer.serialize(post._createSnapshot());
    assert.ok(payload.hasOwnProperty(serializedProperty), 'Add the key to instance');
  });

  test('Serializer respects `serialize: true` on the attrs hash for a `belongsTo` property', function(assert) {
    assert.expect(1);
    env.owner.register(
      'serializer:comment',
      DS.JSONSerializer.extend({
        attrs: {
          post: { serialize: true },
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Rails is omakase' });
    let comment = env.store.createRecord('comment', { body: 'Omakase is delicious', post: post });

    var serializer = env.store.serializerFor('comment');
    var serializedProperty = serializer.keyForRelationship('post', 'belongsTo');

    var payload = serializer.serialize(comment._createSnapshot());
    assert.ok(payload.hasOwnProperty(serializedProperty), 'Add the key to instance');
  });

  test('Serializer should merge attrs from superclasses', function(assert) {
    assert.expect(4);
    Post.reopen({
      description: DS.attr('string'),
      anotherString: DS.attr('string'),
    });
    var BaseSerializer = DS.JSONSerializer.extend({
      attrs: {
        title: 'title_payload_key',
        anotherString: 'base_another_string_key',
      },
    });
    env.owner.register(
      'serializer:post',
      BaseSerializer.extend({
        attrs: {
          description: 'description_payload_key',
          anotherString: 'overwritten_another_string_key',
        },
      })
    );

    let post = env.store.createRecord('post', {
      title: 'Rails is omakase',
      description: 'Omakase is delicious',
      anotherString: 'yet another string',
    });
    let payload = env.store.serializerFor('post').serialize(post._createSnapshot());

    assert.equal(payload.title_payload_key, 'Rails is omakase');
    assert.equal(payload.description_payload_key, 'Omakase is delicious');
    assert.equal(payload.overwritten_another_string_key, 'yet another string');
    assert.ok(!payload.base_another_string_key, 'overwritten key is not added');
  });

  test('Serializer should respect the primaryKey attribute when extracting records', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        primaryKey: '_ID_',
      })
    );

    let jsonHash = { _ID_: 1, title: 'Rails is omakase' };
    let post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.equal(post.data.id, '1');
    assert.equal(post.data.attributes.title, 'Rails is omakase');
  });

  test('Serializer should respect the primaryKey attribute when serializing records', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        primaryKey: '_ID_',
      })
    );

    let post = env.store.createRecord('post', { id: '1', title: 'Rails is omakase' });
    let payload = env.store
      .serializerFor('post')
      .serialize(post._createSnapshot(), { includeId: true });

    assert.equal(payload._ID_, '1');
  });

  test('Serializer should respect keyForAttribute when extracting records', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForAttribute(key) {
          return key.toUpperCase();
        },
      })
    );

    let jsonHash = { id: 1, TITLE: 'Rails is omakase' };
    let post = env.store.serializerFor('post').normalize(Post, jsonHash);

    assert.equal(post.data.id, '1');
    assert.equal(post.data.attributes.title, 'Rails is omakase');
  });

  test('Serializer should respect keyForRelationship when extracting records', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        keyForRelationship(key, type) {
          return key.toUpperCase();
        },
      })
    );

    let jsonHash = { id: 1, title: 'Rails is omakase', COMMENTS: ['1'] };
    let post = env.store.serializerFor('post').normalize(Post, jsonHash);

    assert.deepEqual(post.data.relationships.comments.data, [{ id: '1', type: 'comment' }]);
  });

  test('Calling normalize should normalize the payload (only the passed keys)', function(assert) {
    assert.expect(1);
    var Person = DS.Model.extend({
      posts: DS.hasMany('post', { async: false }),
    });
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          notInHash: 'aCustomAttrNotInHash',
          inHash: 'aCustomAttrInHash',
        },
      })
    );

    env.owner.register('model:person', Person);

    Post.reopen({
      content: DS.attr('string'),
      author: DS.belongsTo('person', { async: false }),
      notInHash: DS.attr('string'),
      inHash: DS.attr('string'),
    });

    var normalizedPayload = env.store.serializerFor('post').normalize(Post, {
      id: '1',
      title: 'Ember rocks',
      author: 1,
      aCustomAttrInHash: 'blah',
    });

    assert.deepEqual(normalizedPayload, {
      data: {
        id: '1',
        type: 'post',
        attributes: {
          inHash: 'blah',
          title: 'Ember rocks',
        },
        relationships: {
          author: {
            data: { id: '1', type: 'person' },
          },
        },
      },
    });
  });

  test('serializeBelongsTo with async polymorphic', function(assert) {
    var json = {};
    var expected = { post: '1', postTYPE: 'post' };

    env.owner.register(
      'serializer:favorite',
      DS.JSONSerializer.extend({
        serializePolymorphicType(snapshot, json, relationship) {
          var key = relationship.key;
          json[key + 'TYPE'] = snapshot.belongsTo(key).modelName;
        },
      })
    );

    let post = env.store.createRecord('post', { title: 'Kitties are omakase', id: '1' });
    let favorite = env.store.createRecord('favorite', { post: post, id: '3' });

    env.store.serializerFor('favorite').serializeBelongsTo(favorite._createSnapshot(), json, {
      key: 'post',
      options: { polymorphic: true, async: true },
    });

    assert.deepEqual(json, expected, 'returned JSON is correct');
  });

  test('extractErrors respects custom key mappings', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: 'le_title',
          comments: { key: 'my_comments' },
        },
      })
    );

    var payload = {
      errors: [
        {
          source: { pointer: 'data/attributes/le_title' },
          detail: 'title errors',
        },
        {
          source: { pointer: 'data/attributes/my_comments' },
          detail: 'comments errors',
        },
      ],
    };

    var errors = env.store.serializerFor('post').extractErrors(env.store, Post, payload);

    assert.deepEqual(errors, {
      title: ['title errors'],
      comments: ['comments errors'],
    });
  });

  test('extractErrors expects error information located on the errors property of payload', function(assert) {
    env.owner.register('serializer:post', DS.JSONSerializer.extend());

    var payload = {
      attributeWhichWillBeRemovedinExtractErrors: ['true'],
      errors: [
        {
          source: { pointer: 'data/attributes/title' },
          detail: 'title errors',
        },
      ],
    };

    var errors = env.store.serializerFor('post').extractErrors(env.store, Post, payload);

    assert.deepEqual(errors, { title: ['title errors'] });
  });

  test('extractErrors leaves payload untouched if it has no errors property', function(assert) {
    env.owner.register('serializer:post', DS.JSONSerializer.extend());

    var payload = {
      untouchedSinceNoErrorsSiblingPresent: ['true'],
    };

    var errors = env.store.serializerFor('post').extractErrors(env.store, Post, payload);

    assert.deepEqual(errors, { untouchedSinceNoErrorsSiblingPresent: ['true'] });
  });

  test('normalizeResponse should extract meta using extractMeta', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        extractMeta(store, modelClass, payload) {
          let meta = this._super(...arguments);
          meta.authors.push('Tomhuda');
          return meta;
        },
      })
    );

    var jsonHash = {
      id: '1',
      title_payload_key: 'Rails is omakase',
      my_comments: [1, 2],
      meta: {
        authors: ['Tomster'],
      },
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.deepEqual(post.meta.authors, ['Tomster', 'Tomhuda']);
  });

  test('normalizeResponse returns empty `included` payload by default', function(assert) {
    env.owner.register('serializer:post', DS.JSONSerializer.extend());

    var jsonHash = {
      id: '1',
      title: 'Rails is omakase',
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.deepEqual(post.included, []);
  });

  test('normalizeResponse returns empty `included` payload when relationship is undefined', function(assert) {
    env.owner.register('serializer:post', DS.JSONSerializer.extend());

    var jsonHash = {
      id: '1',
      title: 'Rails is omakase',
      comments: null,
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.deepEqual(post.included, []);
  });

  test('normalizeResponse respects `included` items (single response)', function(assert) {
    env.owner.register('serializer:comment', DS.JSONSerializer);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend(DS.EmbeddedRecordsMixin, {
        attrs: {
          comments: { embedded: 'always' },
        },
      })
    );

    var jsonHash = {
      id: '1',
      title: 'Rails is omakase',
      comments: [{ id: '1', body: 'comment 1' }, { id: '2', body: 'comment 2' }],
    };

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');

    assert.deepEqual(post.included, [
      { id: '1', type: 'comment', attributes: { body: 'comment 1' }, relationships: {} },
      { id: '2', type: 'comment', attributes: { body: 'comment 2' }, relationships: {} },
    ]);
  });

  test('normalizeResponse respects `included` items (array response)', function(assert) {
    env.owner.register('serializer:comment', DS.JSONSerializer);
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend(DS.EmbeddedRecordsMixin, {
        attrs: {
          comments: { embedded: 'always' },
        },
      })
    );

    var payload = [
      {
        id: '1',
        title: 'Rails is omakase',
        comments: [{ id: '1', body: 'comment 1' }],
      },
      {
        id: '2',
        title: 'Post 2',
        comments: [{ id: '2', body: 'comment 2' }, { id: '3', body: 'comment 3' }],
      },
    ];

    var post = env.store
      .serializerFor('post')
      .normalizeResponse(env.store, Post, payload, '1', 'findAll');

    assert.deepEqual(post.included, [
      { id: '1', type: 'comment', attributes: { body: 'comment 1' }, relationships: {} },
      { id: '2', type: 'comment', attributes: { body: 'comment 2' }, relationships: {} },
      { id: '3', type: 'comment', attributes: { body: 'comment 3' }, relationships: {} },
    ]);
  });

  testInDebug('normalizeResponse ignores unmapped attributes', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: { serialize: false },
          notInMapping: { serialize: false },
        },
      })
    );

    var jsonHash = {
      id: '1',
      notInMapping: 'I should be ignored',
      title: 'Rails is omakase',
    };

    assert.expectWarning(function() {
      var post = env.store
        .serializerFor('post')
        .normalizeResponse(env.store, Post, jsonHash, '1', 'findRecord');
      assert.equal(post.data.attributes.title, 'Rails is omakase');
    }, /There is no attribute or relationship with the name/);
  });

  test('options are passed to transform for serialization', function(assert) {
    assert.expect(1);

    env.owner.register(
      'transform:custom',
      DS.Transform.extend({
        serialize: function(deserialized, options) {
          assert.deepEqual(options, { custom: 'config' });
        },
      })
    );

    Post.reopen({
      custom: DS.attr('custom', {
        custom: 'config',
      }),
    });

    let post = env.store.createRecord('post', { custom: 'value' });

    serializer.serialize(post._createSnapshot());
  });

  test('options are passed to transform for normalization', function(assert) {
    assert.expect(1);

    env.owner.register(
      'transform:custom',
      DS.Transform.extend({
        deserialize: function(serialized, options) {
          assert.deepEqual(options, { custom: 'config' });
        },
      })
    );

    Post.reopen({
      custom: DS.attr('custom', {
        custom: 'config',
      }),
    });

    serializer.normalize(Post, {
      custom: 'value',
    });
  });

  test('Serializer should respect the attrs hash in links', function(assert) {
    env.owner.register(
      'serializer:post',
      DS.JSONSerializer.extend({
        attrs: {
          title: 'title_payload_key',
          comments: { key: 'my_comments' },
        },
      })
    );

    var jsonHash = {
      title_payload_key: 'Rails is omakase',
      links: {
        my_comments: 'posts/1/comments',
      },
    };

    var post = env.container
      .lookup('serializer:post')
      .normalizeSingleResponse(env.store, Post, jsonHash);

    assert.equal(post.data.attributes.title, 'Rails is omakase');
    assert.equal(post.data.relationships.comments.links.related, 'posts/1/comments');
  });
});
