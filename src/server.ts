import dotenv from 'dotenv';
import yaml from 'js-yaml';
import fs from 'fs';

const config = dotenv.config();
if (config.error) {
  dotenv.config({ path: './process.env' });
}

const swaggerDir = process.env.SWAGGER_DIR;

const testJson = {
  total: 1,
  hasNext: true,
  items: [{
    conversionId: 1,
    projectId: '842a4e35-d613-4825-aaa4-bc07e2d5556c',
    influencerId: '33beabda-a1b2-45e0-b487-da2c6ccf2a65',
    mediaId: 'oosaka-12345',
    offerId: '12345678-aaaaaaaa',
    rewardPrice: '900',
    feePrice: '100',
    'sumPrice': '0',
    'clickDate': '2021-05-15T00:00:00Z',
    'conversionDate': '2021-05-15T00:10:00Z'
  },{
    'conversionId': 1,
    'projectId': '842a4e35-d613-4825-aaa4-bc07e2d5556c',
    'influencerId': '33beabda-a1b2-45e0-b487-da2c6ccf2a65',
    'mediaId': 'oosaka-12345',
    'offerId': '12345678-aaaaaaaa',
    'rewardPrice': '900',
    'feePrice': '100',
    'sumPrice': '0',
    'clickDate': '2021-05-15T00:00:00Z',
    'conversionDate': '2021-05-15T00:10:00Z'
  }]
};

async function compare() {
  try {
    const fieldsError: any[] = [];
    const swagger: any = yaml.load(fs.readFileSync(`${swaggerDir}/swagger.yaml`, { encoding: 'utf-8' }));
    const components = parseComponents();
    const swaggerByMethod: any = {};
    const swaggerByMethodAndStatus: any = {};
    for (const [path, el] of Object.entries(swagger['paths'])) {
      for (const [method, detail] of Object.entries(el)) {
        swaggerByMethod[`${method}-${path}`] = detail['responses'];
      }
    }
    for (const [path, el] of Object.entries(swaggerByMethod)) {
      for (const [statusCode, response] of Object.entries(el)) {
        if (!response?.content?.['application/json']) {
          // empty response
          swaggerByMethodAndStatus[`${statusCode}-${path}`] = null;
          continue;
        }
        if (response?.content?.['application/json']?.schema?.['$ref']) {
          const componentName = response?.content?.['application/json']?.schema?.['$ref']?.match(new RegExp('[^\\/]+$', 'g'))?.[0];
          swaggerByMethodAndStatus[`${statusCode}-${path}`] = components[componentName];
          continue;
        }
        if (response?.content['application/json']?.schema?.properties?.items) {
          // @ts-ignore
          response?.content['application/json']?.schema?.properties?.items?.type = 'array';
        }
        swaggerByMethodAndStatus[`${statusCode}-${path}`] = response?.content['application/json']?.schema;
      }
    }

    for (const [path, response] of Object.entries(swaggerByMethodAndStatus)) {
      const parentFields: any[] = [];
      // TODO: use JSON generated from curl $testJson
      compareJson(response, testJson, fieldsError, path, parentFields);
    }
    console.log('=======================================');
    console.log(fieldsError);
  } catch (error) {
    console.log(error);
  }
}

function parseComponents() {
  const component: any = yaml.load(fs.readFileSync(`${swaggerDir}/src/_components.yaml`, { encoding: 'utf-8' }));
  const componentsGrouped: any = {};
  for (const [className, refPath] of Object.entries(component?.schemas)) {
    const path: any = refPath;
    componentsGrouped[className] = yaml.load(fs.readFileSync(`${swaggerDir}/src/${path?.['$ref']?.slice(2)}`, { encoding: 'utf-8' }));
  }

  return componentsGrouped;
}

function compareJson(expectResp: any, currentResp: any, fields: any[], path: string, parentFields?: string[]) {
  if (expectResp?.type !== 'object' && expectResp?.type === typeof currentResp) {
    return;
  }

  if (!expectResp && currentResp) {
    fields.push({
      reason: 'expected null value',
      path,
      field: 'object'
    });
    return;
  }

  // compare properties
  for (const [name, detail] of Object.entries(expectResp?.properties || expectResp)) {
    const fieldName = parentFields?.length ? `${parentFields.join('.')}.${name}` : name;
    const checkObj: any = detail;
    // lack field
    if (!currentResp[name]) {
      fields.push({
        reason: 'lack field',
        path,
        field: fieldName
      });
      continue;
    }

    if (!checkObj?.properties) {
      // no need recursion
      switch (checkObj?.type) {
        case 'array':
          if (!Array.isArray(currentResp[name])) {
            fields.push({
              reason: 'is not array',
              path,
              field: fieldName
            });
          }
          break;
        case 'float':
          if (typeof currentResp[name] !== 'number') {
            fields.push({
              reason: 'is not float',
              path,
              field: fieldName
            });
          }
          break;
        case 'integer':
          if (!isInteger(currentResp[name])) {
            fields.push({
              reason: 'is not integer',
              path,
              field: fieldName
            });
          }
          break;
        default:
          if (typeof currentResp[name] !== checkObj?.type) {
            fields.push({
              reason: `is not ${checkObj?.type}`,
              path,
              field: fieldName
            });
          }
          break;
      }

      continue;
    }

    if (checkObj?.properties && Array.isArray(currentResp[name])) {
      // recursion
      parentFields.push(name);
      for (const nestedObj of currentResp[name]) {
        compareJson(checkObj?.properties, nestedObj, fields, path, parentFields);
      }
      continue;
    }

    if (checkObj?.properties && !Array.isArray(currentResp[name])) {
      compareJson(checkObj?.properties, currentResp[name], fields, path, parentFields);
    }
  }
}

function isInteger(n: number) {
  return n === +n && n === (n|0);
}

compare();
