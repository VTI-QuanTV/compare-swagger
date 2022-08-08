export const APPLICATION_JSON = 'application/json';
export const COMPONENT_FILE_NAME = '_components.yaml';
export const UTF_8 = 'utf-8';
export const DOUBLE_CR_LF = '\r\n\r\n';
export const REGEX_PROTOCOL_VERSION = '(?<=HTTP\\/2 ).\\S+';
export const REGEX_MATCH_EXPECTED_CODE = '(?<=expect_code: ).\\S+';
export const REGEX_STATUS_CODE_DASH = '(_[^\\_]+$)';
export const REGEX_STATUS_CODE = '([^\\_]+$)';
export const REGEX_TEST_CASE = '[^(output_)].*[^(.json)]';
export const REGEX_LAST_SLASH = '[^\\/]+$';
export const CSV_HEADERS = ['API_ENDPOINT', 'TESTCASE', 'JSON_FILE', 'DESCRIPTION'];

export enum ResultEnum {
    GOOD = 'G',
    NOT_GOOD = 'NG'
}

export enum ErrorMessage {
    MISSING_PROPERTY = 'missing property',
    IS_NOT_ARRAY = 'is not array',
    IS_NOT_FLOAT = 'is not float',
    IS_NOT_INTEGER = 'is not integer',
    REDUNDANT_PROPERTY = 'redundant property',
    MUST_NOT_EMPTY_VALUE = 'must not empty value',
    EXPECTED_NULL_VALUE = 'expected null value',
    UNEXPECTED_HTTP_STATUS = 'unexpected http status code',
}