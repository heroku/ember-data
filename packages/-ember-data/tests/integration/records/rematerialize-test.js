/*eslint no-unused-vars: ["error", { "varsIgnorePattern": "(adam|bob|dudu)" }]*/

import { run } from '@ember/runloop';
import setupStore from 'dummy/tests/helpers/store';
import deepCopy from 'dummy/tests/helpers/deep-copy';
import { module, test } from 'qunit';
import DS from 'ember-data';

const { attr, belongsTo, hasMany, Model } = DS;

let env;

let Person = Model.extend({
  name: attr('string'),
  cars: hasMany('car', { async: false }),
  boats: hasMany('boat', { async: true }),
});
Person.reopenClass({
  toString() {
    return 'Person';
  },
});

let Group = Model.extend({
  people: hasMany('person', { async: false }),
});
Group.reopenClass({
  toString() {
    return 'Group';
  },
});

let Car = Model.extend({
  make: attr('string'),
  model: attr('string'),
  person: belongsTo('person', { async: false }),
});
Car.reopenClass({
  toString() {
    return 'Car';
  },
});

let Boat = Model.extend({
  name: attr('string'),
  person: belongsTo('person', { async: false }),
});
Boat.toString = function() {
  return 'Boat';
};

module('integration/unload - Rematerializing Unloaded Records', function(hooks) {
  hooks.beforeEach(function() {
    env = setupStore({
      adapter: DS.JSONAPIAdapter,
      person: Person,
      car: Car,
      group: Group,
      boat: Boat,
    });
  });

  hooks.afterEach(function() {
    run(function() {
      env.container.destroy();
    });
  });

  test('a sync belongs to relationship to an unloaded record can restore that record', function(assert) {
    // disable background reloading so we do not re-create the relationship.
    env.adapter.shouldBackgroundReloadRecord = () => false;

    let adam = run(() => {
      env.store.push({
        data: {
          type: 'person',
          id: '1',
          attributes: {
            name: 'Adam Sunderland',
          },
          relationships: {
            cars: {
              data: [{ type: 'car', id: '1' }],
            },
          },
        },
      });

      return env.store.peekRecord('person', 1);
    });

    let bob = run(() => {
      env.store.push({
        data: {
          type: 'car',
          id: '1',
          attributes: {
            make: 'Lotus',
            model: 'Exige',
          },
          relationships: {
            person: {
              data: { type: 'person', id: '1' },
            },
          },
        },
      });

      return env.store.peekRecord('car', 1);
    });

    let person = env.store.peekRecord('person', 1);
    assert.equal(person.get('cars.length'), 1, 'The inital length of cars is correct');

    assert.equal(env.store.hasRecordForId('person', 1), true, 'The person is in the store');
    assert.equal(
      env.store._internalModelsFor('person').has(1),
      true,
      'The person internalModel is loaded'
    );

    run(() => person.unloadRecord());

    assert.equal(env.store.hasRecordForId('person', 1), false, 'The person is unloaded');
    assert.equal(
      env.store._internalModelsFor('person').has(1),
      false,
      'The person internalModel is freed'
    );

    run(() => {
      env.store.push({
        data: {
          type: 'person',
          id: '1',
          attributes: {
            name: 'Adam Sunderland',
          },
          relationships: {
            cars: {
              data: [{ type: 'car', id: '1' }],
            },
          },
        },
      });
    });

    let rematerializedPerson = bob.get('person');
    assert.equal(rematerializedPerson.get('id'), '1');
    assert.equal(rematerializedPerson.get('name'), 'Adam Sunderland');
    // the person is rematerialized; the previous person is *not* re-used
    assert.notEqual(rematerializedPerson, adam, 'the person is rematerialized, not recycled');
  });

  test('an async has many relationship to an unloaded record can restore that record', function(assert) {
    assert.expect(16);

    // disable background reloading so we do not re-create the relationship.
    env.adapter.shouldBackgroundReloadRecord = () => false;

    const BOAT_ONE = {
      type: 'boat',
      id: '1',
      attributes: {
        name: 'Boaty McBoatface',
      },
      relationships: {
        person: {
          data: { type: 'person', id: '1' },
        },
      },
    };

    const BOAT_TWO = {
      type: 'boat',
      id: '2',
      attributes: {
        name: 'Some other boat',
      },
      relationships: {
        person: {
          data: { type: 'person', id: '1' },
        },
      },
    };

    let adapterCalls = 0;
    env.adapter.findRecord = function(store, model, param) {
      assert.ok(true, `adapter called ${++adapterCalls}x`);

      let data;
      if (param === '1') {
        data = deepCopy(BOAT_ONE);
      } else if (param === '2') {
        data = deepCopy(BOAT_TWO);
      } else {
        throw new Error(`404: no such boat with id=${param}`);
      }

      return {
        data,
      };
    };

    run(() => {
      env.store.push({
        data: {
          type: 'person',
          id: '1',
          attributes: {
            name: 'Adam Sunderland',
          },
          relationships: {
            boats: {
              data: [{ type: 'boat', id: '2' }, { type: 'boat', id: '1' }],
            },
          },
        },
      });
    });

    run(() => {
      env.store.push({
        data: [deepCopy(BOAT_ONE), deepCopy(BOAT_TWO)],
      });
    });

    let adam = env.store.peekRecord('person', '1');
    let boaty = env.store.peekRecord('boat', '1');

    // assert our initial cache state
    assert.equal(env.store.hasRecordForId('person', '1'), true, 'The person is in the store');
    assert.equal(
      env.store._internalModelsFor('person').has('1'),
      true,
      'The person internalModel is loaded'
    );
    assert.equal(env.store.hasRecordForId('boat', '1'), true, 'The boat is in the store');
    assert.equal(
      env.store._internalModelsFor('boat').has('1'),
      true,
      'The boat internalModel is loaded'
    );

    let boats = run(() => adam.get('boats'));
    assert.equal(boats.get('length'), 2, 'Before unloading boats.length is correct');

    run(() => boaty.unloadRecord());
    assert.equal(boats.get('length'), 1, 'after unloading boats.length is correct');

    // assert our new cache state
    assert.equal(env.store.hasRecordForId('boat', '1'), false, 'The boat is unloaded');
    assert.equal(
      env.store._internalModelsFor('boat').has('1'),
      true,
      'The boat internalModel is retained'
    );

    // cause a rematerialization, this should also cause us to fetch boat '1' again
    boats = run(() => adam.get('boats'));
    let rematerializedBoaty = boats.objectAt(1);

    assert.ok(!!rematerializedBoaty, 'We have a boat!');
    assert.equal(adam.get('boats.length'), 2, 'boats.length correct after rematerialization');
    assert.equal(rematerializedBoaty.get('id'), '1', 'Rematerialized boat has the right id');
    assert.equal(
      rematerializedBoaty.get('name'),
      'Boaty McBoatface',
      'Rematerialized boat has the right name'
    );
    assert.ok(rematerializedBoaty !== boaty, 'the boat is rematerialized, not recycled');

    assert.equal(env.store.hasRecordForId('boat', '1'), true, 'The boat is loaded');
    assert.equal(
      env.store._internalModelsFor('boat').has('1'),
      true,
      'The boat internalModel is retained'
    );
  });
});
