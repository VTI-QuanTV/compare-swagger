import dotenv from 'dotenv';
import yaml from 'js-yaml';
import fs from 'fs';
import pug from 'pug';
import path from 'path';
import { CSV } from './templates/csv/csv';

const config = dotenv.config();
if (config.error) {
  dotenv.config({ path: './process.env' });
}

const swaggerDir = process.env.SWAGGER_DIR;
const responseDir = process.env.RESPONSE_DIR;
const htmlPath = process.env.HTML_PATH;
const csvPath = process.env.CSV_PATH;

function compare() {
  try {
    const fieldsError: {
      reason: string, file: string, path: string, result: 'G' | 'NG', field?: string, expectedStatus?: string, actualStatus?: string
    }[] = [];
    const swagger: any = yaml.load(fs.readFileSync(`${swaggerDir}/swagger.yaml`, { encoding: 'utf-8' }));
    const components = parseComponents();
    const responsesJson = parseResponseFiles();

    const swaggerByMethodAndStatus = groupSwaggerResponseByPath(swagger, components);
    compareStatusCode(responsesJson, fieldsError);
    responsesJson
        .filter((resp) => resp.expectedStatusCode === resp.currentStatusCode)
        .forEach((resp) => {
          const parentFields: any[] = [];
          const expectResp = swaggerByMethodAndStatus[resp.path];
          compareJson(
              resp.case, expectResp, resp?.data, fieldsError, resp.path, parentFields
          );

          if (fieldsError.every((el) => el.path !== resp.path)) {
            //  Good case
            fieldsError.push({
              reason: '',
              result: 'G',
              file: resp.case,
              path: resp.path
            });
          }
        });

    // group field errors
    const regexStatusCode = new RegExp('(_[^\\_]+$)', 'g');
    const groupedResult = fieldsError
        .sort((a, b) => {
          const firstPath = a.path?.replace(regexStatusCode, '');
          const secondPath = b.path?.replace(regexStatusCode, '');
          if (firstPath > secondPath || a.file > b.file) {
            return 1;
          }
          if (firstPath < secondPath || a.file < b.file) {
            return -1;
          }
          return 0;
        })
        .reduce((arr, curr) => {
          const key = `${curr.path}-${curr.file}`;
          const updateElement = arr.find((el) => el.path === key);
          const descriptions = curr.expectedStatus ?
              [`expect status: ${curr.expectedStatus}`,`actual status: ${curr.actualStatus}`] : [`${curr.reason}: ${curr.field}`];
          if (updateElement && curr.result === 'NG') {
            updateElement.descriptions = [...updateElement.descriptions, ...descriptions];
          } else {
            const result = {
              path: key,
              api: curr.path?.replace(regexStatusCode, ''),
              status: curr.path?.match(new RegExp('([^\\_]+$)', 'g'))[0],
              testCase: curr.file,
              result: curr.result,
              descriptions: curr.result === 'NG' ? descriptions : []
            };

            arr.push(result);
          }
          return arr;
        }, []);

    //  write to html
    const templateHtml = pug.compileFile(path.join(__dirname, '/templates/html/template.pug'));
    fs.writeFileSync(
        htmlPath,
        templateHtml({
          resultResp: groupedResult.reduce((acc, curr) => {
                  // @ts-ignore
                  const dataFound = acc.find((el) => el.api === curr.api);
                  if (dataFound) {
                    dataFound.data = [...dataFound.data, curr];
                  } else {
                    acc.push({
                     api: curr.api,
                     data: [curr]
                    });
                  }
                  return acc;
                }, [])
        })
    );

    // write to csv
    const csv: CSV = new CSV();
    const dataCsv = groupedResult.map((el) => `${el.api},${el.testCase},${el.result},"${el.descriptions.toString()}"`);
    csv.setData(dataCsv);
    csv.build(csvPath);
  } catch (error) {
    console.error(error);
  }
}

function groupSwaggerResponseByPath(swagger: any, components: any) {
  const swaggerByMethod: any = {};
  const swaggerRespGrouped: any = {};
  for (const [path, el] of Object.entries(swagger['paths'])) {
    for (const [method, detail] of Object.entries(el)) {
      swaggerByMethod[`${method?.toLowerCase()}${path.replace(/\//g, '_').replace(/{|}|_v1_projects/g, '')}`] = detail['responses'];
    }
  }
  for (const [path, el] of Object.entries(swaggerByMethod)) {
    for (const [statusCode, response] of Object.entries(el)) {
      const key = (`${path}_${statusCode}`)?.toLowerCase();
      if (!response?.content?.['application/json']) {
        // empty response
        swaggerRespGrouped[key] = null;
        continue;
      }
      if (response?.content?.['application/json']?.schema?.['$ref']) {
        const componentName = response?.content?.['application/json']?.schema?.['$ref']?.match(new RegExp('[^\\/]+$', 'g'))?.[0];
        swaggerRespGrouped[key] = components[componentName];
        continue;
      }
      if (response?.content['application/json']?.schema?.properties?.items) {
        // @ts-ignore
        response?.content['application/json']?.schema?.properties?.items?.type = 'array';
      }
      swaggerRespGrouped[key] = response?.content['application/json']?.schema;
    }
  }

  return swaggerRespGrouped;
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

function compareStatusCode(
    responseJson: { path: string, case: string, expectedStatusCode: string, currentStatusCode: string, data: any }[],
    fieldsError: { reason: string, file: string, path: string, result: 'G'| 'NG', field?: string, expectedStatus?: string, actualStatus?: string }[]
  ) {
  responseJson.forEach((resp) => {
    if (resp.expectedStatusCode !== resp.currentStatusCode) {
      fieldsError.push({
        reason: 'unexpected http status code',
        result: 'NG',
        file: resp.case,
        path: resp.path,
        expectedStatus: resp.expectedStatusCode,
        actualStatus: resp.currentStatusCode
      });
    }
  });
}

function compareJson(caseName: string, expectResp: any, currentResp: any, fields: any[], path: string, parentFields?: string[], index?: number) {
  if ((expectResp?.type !== 'object' && expectResp?.type === typeof currentResp) || expectResp === currentResp) {
    return;
  }

  if (!expectResp && currentResp) {
    fields.push({
      reason: 'expected null value',
      result: 'NG',
      file: caseName,
      path
    });
    return;
  }

  if (!currentResp && expectResp) {
    fields.push({
      reason: 'must not empty value',
      result: 'NG',
      file: caseName,
      path
    });
    return;
  }


  //  check redundant fields
  const redundantFields = Object.keys(currentResp).filter(
      (key) => Object.keys(expectResp?.properties || expectResp).every((currentKey) => currentKey !== key)
  );

  if (redundantFields?.length) {
    redundantFields.forEach((field) => {
      const fieldName = parentFields?.length ? `${parentFields.join('.')}${(typeof index === 'number') ? `[${index}]` : ''}.${field}` : field;
      fields.push({
        reason: 'redundant property',
        result: 'NG',
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
    // eslint-disable-next-line no-prototype-builtins
    if (!currentResp.hasOwnProperty(name)) {
      fields.push({
        reason: 'missing property',
        file: caseName,
        result: 'NG',
        path,
        field: fieldName
      });
      continue;
    }

    if (!checkObj?.properties && currentResp[name] !== null) {
      // no need recursion
      switch (checkObj?.type) {
        case 'array':
          if (!Array.isArray(currentResp[name])) {
            fields.push({
              reason: 'is not array',
              file: caseName,
              result: 'NG',
              path,
              field: fieldName
            });
          }
          if (Array.isArray(currentResp[name]) && checkObj?.items) {
            // recursion
            let idx = (typeof index === 'number') ? index : 0;
            parentFields.push(name);
            for (const nestedObj of currentResp[name]) {
              compareJson(caseName, checkObj?.items, nestedObj, fields, path, parentFields, idx);
              idx++;
            }
          }
          break;
        case 'float':
          if (typeof currentResp[name] !== 'number') {
            fields.push({
              reason: 'is not float',
              file: caseName,
              result: 'NG',
              path,
              field: fieldName
            });
          }
          break;
        case 'integer':
          if (!isInteger(currentResp[name])) {
            fields.push({
              reason: 'is not integer',
              result: 'NG',
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
              result: 'NG',
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

function parseResponseFiles(): {
    path: string,
    case: string,
    expectedStatusCode: string,
    currentStatusCode: string,
    data: any,
  }[] {
  const currentResponses: {
    path: string,
    case: string,
    expectedStatusCode: string,
    currentStatusCode: string,
    data: any,
  }[] = [];
  const dirs = fs.readdirSync(responseDir);
  for (const apiUrl of dirs) {
    const files = fs.readdirSync(`${responseDir}/${apiUrl}`);
    for (const fileName of files) {
      const file =  fs.readFileSync(`${responseDir}/${apiUrl}/${fileName}`, { encoding: 'utf-8' });
      const chunks = file.split('\r\n\r\n');
      const currentStatusCode = chunks[0].match(new RegExp('(?<=HTTP\\/2 ).\\S+', 'gm'))[0];
      try {
        currentResponses.push({
          path: (`${apiUrl}_${currentStatusCode}`)?.trim(),
          case: fileName?.trim(),
          currentStatusCode: currentStatusCode?.trim(),
          expectedStatusCode: chunks[2].match(new RegExp('(?<=expect_code:).\\S+', 'gm'))[0]?.trim(),
          data: chunks[1]?.length ? JSON.parse(chunks[1]?.trim()) : null
        });
      } catch (err) {
        console.info('invalid response type in case: ', `${responseDir}/${apiUrl}/${fileName}`);
      }
    }
  }

  return currentResponses;
}

function isInteger(n: number) {
  return n === +n && n === (n|0);
}

compare();
