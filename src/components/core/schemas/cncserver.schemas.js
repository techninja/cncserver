/**
 * @file Wrapper module for verifying data to schemas, and providing errors.
 */
const Ajv = require('ajv');

// Global core component export object to be attached.
const schemas = { id: 'schemas', all: {} };

module.exports = (cncserver) => {
  const ajv = Ajv({
    allErrors: true,
    removeAdditional: true,
    unknownFormats: ['checkbox', 'color', 'range', 'tabs', 'categories', 'number'],
  });

  // Format the AJV field error messages.
  function formatMessages(errors) {
    const fields = errors.reduce((acc, e) => {
      if (e.dataPath.length && e.dataPath[0] === '.') {
        const av = e.params.allowedValues ? `: ${e.params.allowedValues.join(', ')}` : '';
        acc[e.dataPath.slice(1)] = [`${e.message}${av}`];
      } else {
        acc[e.dataPath] = [e.message];
      }
      return acc;
    },
      {});

    return { fields };
  }

  // Fill in defaults of the entire schema, forked from:
  // https://github.com/harmvandendorpel/json-schema-fill-defaults
  function autoDefaults(data, schema) {
    function processNode(schemaNode, dataNode) {
      switch (schemaNode.type) {
        case 'object':
          return processObject(schemaNode, dataNode); // eslint-disable-line no-use-before-define

        case 'array':
          return processArray(schemaNode, dataNode); // eslint-disable-line no-use-before-define

        default:
          if (dataNode !== undefined) return dataNode;
          if (schemaNode.default !== undefined) return schemaNode.default;
          return undefined;
      }
    }

    function forOwn(object, callback) {
      Object.keys(object).map(key => callback(object[key], key, object));
    }

    function processObject(schemaNode, dataNode) {
      const result = {};
      // If no properties, pick the first oneOf.
      if (!schemaNode.properties) {
        schemaNode.properties = schemaNode.oneOf[0].properties;
      }
      forOwn(schemaNode.properties, (propertySchema, propertyName) => {
        const nodeValue = dataNode !== undefined ? dataNode[propertyName] : undefined;
        result[propertyName] = processNode(propertySchema, nodeValue);
      });

      if (dataNode) {
        forOwn(dataNode, (propertyValue, propertyName) => {
          if (result[propertyName] === undefined && propertyValue !== undefined) {
            result[propertyName] = propertyValue;
          }
        });
      }
      return result;
    }

    function processArray(schemaNode, dataNode) {
      if (dataNode === undefined) {
        if (schemaNode.default) {
          return schemaNode.default;
        }

        return undefined;
      }

      const result = [];

      for (let i = 0; i < dataNode.length; i++) {
        result.push(processNode(schemaNode.items, dataNode[i]));
      }
      return result;
    }

    return processNode(schema, data);
  }

  // Add all schemas captured via binder.
  schemas.all = cncserver.binder.trigger('schemas.compile', schemas.all);

  // After controller load, load all file schemas from index.
  cncserver.binder.bindTo('controller.setup', schemas.id, () => {
    // eslint-disable-next-line global-require
    schemas.all = { ...schemas.all, ...require('./index')(cncserver) };

    // Compile final list of schemas, registered by their key.
    Object.entries(schemas.all).forEach(([key, schema]) => {
      ajv.addSchema(schema, key);
    });

    cncserver.binder.trigger('schemas.loaded');
  });

  // Get a completely filled out default data object, with passed modifier object.
  schemas.getDataDefault = (type, data) => autoDefaults(data, schemas.all[type]);

  // Get a full schema by name.
  schemas.getFromRequest = (path) => {
    const type = path.split('/')[2];
    return ajv.getSchema(type) ? ajv.getSchema(type).schema : null;
  };

  // Validate data given a specific schema by name from above.
  schemas.validateData = (type, data, provideDefaults = false) => new Promise(
    (resolve, reject) => {
      const isValid = ajv.validate(type, data);
      if (isValid) {
        if (provideDefaults) {
          resolve(schemas.getDataDefault(type, data));
        } else {
          resolve(data);
        }
      } else {
        reject(formatMessages(ajv.errors));
      }
    }
  );


  return schemas;
};
