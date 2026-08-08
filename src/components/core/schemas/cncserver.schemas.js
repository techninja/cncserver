/**
 * @file Wrapper module for verifying data to schemas, and providing errors.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { trigger, bindTo } from 'cs/binder';
import schemas from 'cs/schemas/index';
import { applyObjectTo } from 'cs/utils';

const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  strictTypes: false,   // format on boolean/number is intentional (UI hints)
  strictSchema: false,  // step, options etc. are intentional UI-hint keywords
});

// Standard formats (date, email, uri, etc.)
addFormats(ajv);

// UI-hint formats used by the form renderer — registered as pass-through.
// These are valid in the json-editor/jsonforms convention.
['checkbox', 'color', 'range', 'tabs', 'categories', 'number', 'textarea'].forEach(
  fmt => ajv.addFormat(fmt, { type: 'string', validate: () => true })
);

// Format the AJV field error messages.
function formatMessages(errors) {
  const fields = errors.reduce((acc, e) => {
    const path = e.instancePath || e.dataPath || '';
    if (path.length) {
      const key = path.replace(/^\/|\./, '').replace(/\//g, '.');
      const av = e.params.allowedValues ? `: ${e.params.allowedValues.join(', ')}` : '';
      acc[key] = [`${e.message}${av}`];
    } else {
      acc[path] = [e.message];
    }
    return acc;
  }, {});

  return { fields };
}

// Fill in defaults of the entire schema, forked from:
// https://github.com/harmvandendorpel/json-schema-fill-defaults
function autoDefaults(data, schema) {
  function processNode(schemaNode, dataNode) {
    switch (schemaNode.type) {
      case 'object':
        // eslint-disable-next-line no-use-before-define
        return processObject(schemaNode, dataNode);

      case 'array':
        // eslint-disable-next-line no-use-before-define
        return processArray(schemaNode, dataNode);

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
      // eslint-disable-next-line no-param-reassign
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
// applyObjectTo(trigger('schemas.compile', schemas), schemas);

// After controller load, load all file schemas from index.
bindTo('controller.setup', 'schemas', () => {
  // Compile final list of schemas, registered by their key.
  Object.entries(schemas).forEach(([key, schema]) => {
    ajv.addSchema(schema, key);
  });

  trigger('schemas.loaded', null, true);
});

// Get a completely filled out default data object, with passed modifier object.
export const getDataDefault = (type, data) => autoDefaults(data, schemas[type]);

// Get a full schema by name.
export function getFromRequest(path) {
  const type = path.split('/')[2];
  return ajv.getSchema(type) ? ajv.getSchema(type).schema : null;
}

// Validate data given a specific schema by name from above.
export const validateData = (type, data, provideDefaults = false) => new Promise(
  (resolve, reject) => {
    const isValid = ajv.validate(type, data);
    if (isValid) {
      if (provideDefaults) {
        resolve(getDataDefault(type, data));
      } else {
        resolve(data);
      }
    } else {
      reject(formatMessages(ajv.errors));
    }
  }
);
