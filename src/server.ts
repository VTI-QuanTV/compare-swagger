import dotenv from 'dotenv';
import yaml from 'js-yaml';
import fs from 'fs';

const config = dotenv.config();
if (config.error) {
  dotenv.config({ path: './process.env' });
}

const swaggerDir = process.env.SWAGGER_DIR;
const responseDir = process.env.RESPONSE_DIR;

async function compare() {
  try {
    const fieldsError: any[] = [];
    const swagger: any = yaml.load(fs.readFileSync(`${swaggerDir}/swagger.yaml`, { encoding: 'utf-8' }));
    const responsesJson = parseResponseFiles();
    const components = parseComponents();
    const swaggerByMethod: any = {};
    const swaggerByMethodAndStatus: any = {};
    for (const [path, el] of Object.entries(swagger['paths'])) {
      for (const [method, detail] of Object.entries(el)) {
        swaggerByMethod[`${capitalizeFirstLetter(method)}${path.replace(/\//g, '_').replace(/{|}|_v1_projects/g, '')}`] = detail['responses'];
      }
    }
    for (const [path, el] of Object.entries(swaggerByMethod)) {
      for (const [statusCode, response] of Object.entries(el)) {
        const key = `${path}_${statusCode}`;
        if (!response?.content?.['application/json']) {
          // empty response
          swaggerByMethodAndStatus[key] = null;
          continue;
        }
        if (response?.content?.['application/json']?.schema?.['$ref']) {
          const componentName = response?.content?.['application/json']?.schema?.['$ref']?.match(new RegExp('[^\\/]+$', 'g'))?.[0];
          swaggerByMethodAndStatus[key] = components[componentName];
          continue;
        }
        if (response?.content['application/json']?.schema?.properties?.items) {
          // @ts-ignore
          response?.content['application/json']?.schema?.properties?.items?.type = 'array';
        }
        swaggerByMethodAndStatus[key] = response?.content['application/json']?.schema;
      }
    }

    for (const [path, response] of Object.entries(swaggerByMethodAndStatus)) {
      const objects = responsesJson.filter((el) => el?.path === path);
      objects.forEach((obj) => {
        const parentFields: any[] = [];
        compareJson(obj.case, response, obj?.data, fieldsError, path, parentFields);
      });
    }
    console.log('=======================================');
    console.log(fieldsError);
  } catch (error) {
    console.error(error);
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

function compareJson(caseName: string, expectResp: any, currentResp: any, fields: any[], path: string, parentFields?: string[], index?: number) {
  if (expectResp?.type !== 'object' && expectResp?.type === typeof currentResp) {
    return;
  }

  if (!expectResp && currentResp) {
    fields.push({
      reason: 'expected null value',
      file: caseName,
      path,
      field: 'object'
    });
    return;
  }

  //  check redundant fields
  const redundantFields = Object.keys(currentResp).filter(
      (key) => Object.keys(expectResp?.properties || expectResp).every((currentKey) => currentKey !== key)
  );

  if (redundantFields?.length) {
    redundantFields.forEach((field) => {
      if (parentFields?.length) {

      }
      const fieldName = parentFields?.length ? `${parentFields.join('.')}${(typeof index === 'number') ? `[${index}]` : ''}.${field}` : field;
      fields.push({
        reason: 'redundant property',
        file: caseName,
        path,
        field: fieldName
      });
    });
  }

  // compare to expected
  for (const [name, detail] of Object.entries(expectResp?.properties || expectResp)) {
    const fieldName = parentFields?.length ? `${parentFields.join('.')}${(typeof index === 'number') ? `[${index}]` : ''}.${name}` : name;
    const checkObj: any = detail;
    // lack field
    if (currentResp[name] === undefined || currentResp[name] === null) {
      fields.push({
        reason: 'missing property',
        file: caseName,
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
              file: caseName,
              path,
              field: fieldName
            });
          }
          break;
        case 'float':
          if (typeof currentResp[name] !== 'number') {
            fields.push({
              reason: 'is not float',
              file: caseName,
              path,
              field: fieldName
            });
          }
          break;
        case 'integer':
          if (!isInteger(currentResp[name])) {
            fields.push({
              reason: 'is not integer',
              file: caseName,
              path,
              field: fieldName
            });
          }
          break;
        default:
          if (typeof currentResp[name] !== checkObj?.type) {
            fields.push({
              reason: `is not ${checkObj?.type}`,
              file: caseName,
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
      let idx = (typeof index === 'number') ? index : 0;
      parentFields.push(name);
      for (const nestedObj of currentResp[name]) {
        compareJson(caseName, checkObj?.properties, nestedObj, fields, path, parentFields, idx);
        idx++;
      }
      continue;
    }

    if (checkObj?.properties && !Array.isArray(currentResp[name])) {
      compareJson(caseName, checkObj?.properties, currentResp[name], fields, path, parentFields, index);
    }
  }
}

function parseResponseFiles() {
  const currentResponses: any[] = [];
  const dirs = fs.readdirSync(responseDir);
  for (const apiUrl of dirs) {
    const files = fs.readdirSync(`${responseDir}/${apiUrl}`);
    for (const fileName of files) {
      const file =  fs.readFileSync(`${responseDir}/${apiUrl}/${fileName}`, { encoding: 'utf-8' });
      const chunks = file.split('\r\n\r\n');
      try {
        currentResponses.push({
          path: `${apiUrl}_${chunks[0].match(new RegExp('(?<=HTTP\\/2 ).\\S+', 'gm'))[0]}`,
          case: fileName,
          data: JSON.parse(chunks[1])
        });
      } catch (err) {
        console.info('invalid response type');
      }
    }
  }

  return currentResponses;
}

function isInteger(n: number) {
  return n === +n && n === (n|0);
}

function capitalizeFirstLetter(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

compare();
