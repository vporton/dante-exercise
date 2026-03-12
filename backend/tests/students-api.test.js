const assert = require("assert");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const nodeFetch = require("node-fetch");
const path = require("path");
const { Duplex, Readable } = require("stream");

process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET || "test-access-secret";
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET || "test-refresh-secret";
process.env.CSRF_TOKEN_SECRET = process.env.CSRF_TOKEN_SECRET || "test-csrf-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/test";

global.fetch = global.fetch || nodeFetch;
global.Headers = global.Headers || nodeFetch.Headers;
global.Request = global.Request || nodeFetch.Request;
global.Response = global.Response || nodeFetch.Response;

express.json = () => (req, _res, next) => next();

const rootDir = path.resolve(__dirname, "..");
const studentsServicePath = path.join(rootDir, "src/modules/students/students-service.js");

const serviceState = {
  calls: {
    getAllStudents: [],
    addNewStudent: [],
    getStudentDetail: [],
    setStudentStatus: [],
    updateStudent: [],
    deleteStudent: [],
  },
  impl: {},
};

function resetServiceState() {
  serviceState.calls.getAllStudents = [];
  serviceState.calls.addNewStudent = [];
  serviceState.calls.getStudentDetail = [];
  serviceState.calls.setStudentStatus = [];
  serviceState.calls.updateStudent = [];
  serviceState.calls.deleteStudent = [];
  serviceState.impl.getAllStudents = async () => ({
    students: [
      {
        id: 1,
        name: "Jane Doe",
        email: "jane@example.com",
        lastLogin: null,
        systemAccess: true,
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    },
  });
  serviceState.impl.addNewStudent = async () => ({
    message: "Student added and verification email sent successfully.",
  });
  serviceState.impl.getStudentDetail = async (id) => ({
    id: Number(id),
    name: "Jane Doe",
    email: "jane@example.com",
    class: "Ten",
    section: "A",
    roll: 11,
  });
  serviceState.impl.setStudentStatus = async () => ({
    message: "Student status changed successfully",
  });
  serviceState.impl.updateStudent = async () => ({
    message: "Student updated successfully",
  });
  serviceState.impl.deleteStudent = async () => ({
    message: "Student deleted successfully",
  });
}

resetServiceState();

require.cache[studentsServicePath] = {
  id: studentsServicePath,
  filename: studentsServicePath,
  loaded: true,
  exports: {
    getAllStudents: (...args) => {
      serviceState.calls.getAllStudents.push(args);
      return serviceState.impl.getAllStudents(...args);
    },
    addNewStudent: (...args) => {
      serviceState.calls.addNewStudent.push(args);
      return serviceState.impl.addNewStudent(...args);
    },
    getStudentDetail: (...args) => {
      serviceState.calls.getStudentDetail.push(args);
      return serviceState.impl.getStudentDetail(...args);
    },
    setStudentStatus: (...args) => {
      serviceState.calls.setStudentStatus.push(args);
      return serviceState.impl.setStudentStatus(...args);
    },
    updateStudent: (...args) => {
      serviceState.calls.updateStudent.push(args);
      return serviceState.impl.updateStudent(...args);
    },
    deleteStudent: (...args) => {
      serviceState.calls.deleteStudent.push(args);
      return serviceState.impl.deleteStudent(...args);
    },
  },
};

const { app } = require(path.join(rootDir, "src/app"));

function makeAuthHeaders({
  userId = 99,
  csrfToken = "csrf-token",
  includeCsrfHeader = true,
  accessSecret = process.env.JWT_ACCESS_TOKEN_SECRET,
  refreshSecret = process.env.JWT_REFRESH_TOKEN_SECRET,
} = {}) {
  const csrfHmac = crypto
    .createHmac("sha256", process.env.CSRF_TOKEN_SECRET)
    .update(csrfToken)
    .digest("hex");

  const accessToken = jwt.sign({ id: userId, csrf_hmac: csrfHmac }, accessSecret, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ id: userId }, refreshSecret, {
    expiresIn: "8h",
  });

  const headers = {
    Cookie: `accessToken=${accessToken}; refreshToken=${refreshToken}`,
  };

  if (includeCsrfHeader) {
    headers["x-csrf-token"] = csrfToken;
  }

  return headers;
}

function createMockSocket() {
  const socket = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  socket.remoteAddress = "127.0.0.1";
  socket.writable = true;
  socket.readable = true;
  socket.destroy = socket.destroy.bind(socket);

  return socket;
}

function sendRequest({ method, urlPath, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const normalizedHeaders = Object.entries({
      ...(payload
        ? {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
          }
        : {}),
      ...headers,
    }).reduce((acc, [key, value]) => {
      acc[key.toLowerCase()] = String(value);
      return acc;
    }, {});

    const socket = createMockSocket();
    const req = new Readable({
      read() {},
    });
    req.method = method;
    req.url = urlPath;
    req.headers = normalizedHeaders;
    req.connection = socket;
    req.socket = socket;
    req.body = body || {};
    req.httpVersion = "1.1";
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;

    const res = new http.ServerResponse(req);
    const bodyChunks = [];
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.assignSocket(socket);

    res.write = (chunk, encoding, callback) => {
      if (chunk) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }

      return originalWrite(chunk, encoding, callback);
    };

    res.end = (chunk, encoding, callback) => {
      if (chunk) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      }

      return originalEnd(chunk, encoding, callback);
    };

    res.on("finish", () => {
      const text = Buffer.concat(bodyChunks).toString("utf8");
      let json = null;

      if (text) {
        try {
          json = JSON.parse(text);
        } catch (error) {
          json = null;
        }
      }

      resolve({
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        body: json,
        text,
      });
    });

    res.on("error", reject);

    app.handle(req, res, reject);

    process.nextTick(() => {
      if (payload) {
        req.push(payload);
      }
      req.push(null);
    });
  });
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test("GET /api/v1/students rejects requests without auth cookies", async () => {
  resetServiceState();

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students",
  });

  assert.strictEqual(response.statusCode, 401);
  assert.deepStrictEqual(response.body, {
    error: "Unauthorized. Please provide valid tokens.",
  });
  assert.strictEqual(serviceState.calls.getAllStudents.length, 0);
});

test("GET /api/v1/students rejects requests without csrf header", async () => {
  resetServiceState();

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students",
    headers: makeAuthHeaders({ includeCsrfHeader: false }),
  });

  assert.strictEqual(response.statusCode, 400);
  assert.deepStrictEqual(response.body, { error: "Invalid csrf token" });
  assert.strictEqual(serviceState.calls.getAllStudents.length, 0);
});

test("GET /api/v1/students returns students and forwards query filters", async () => {
  resetServiceState();
  serviceState.impl.getAllStudents = async () => ({
    students: [{ id: 7, name: "Alice", email: "alice@example.com", systemAccess: true }],
    pagination: {
      page: 2,
      limit: 5,
      total: 9,
      totalPages: 2,
    },
  });

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students?page=2&limit=5&search=Ali&class=Ten&section=A",
    headers: makeAuthHeaders(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    students: [{ id: 7, name: "Alice", email: "alice@example.com", systemAccess: true }],
    pagination: {
      page: 2,
      limit: 5,
      total: 9,
      totalPages: 2,
    },
  });
  assert.deepStrictEqual(serviceState.calls.getAllStudents[0][0], {
    page: 2,
    limit: 5,
    search: "Ali",
    className: "Ten",
    section: "A",
  });
});

test("GET /api/v1/students uses default pagination when query params are absent", async () => {
  resetServiceState();

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students",
    headers: makeAuthHeaders(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(serviceState.calls.getAllStudents[0][0], {
    page: 1,
    limit: 10,
    search: undefined,
    className: undefined,
    section: undefined,
  });
  assert.deepStrictEqual(response.body.pagination, {
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  });
});

test("POST /api/v1/students creates a student", async () => {
  resetServiceState();
  const payload = {
    name: "New Student",
    email: "new.student@example.com",
    class_name: "Ten",
    section_name: "A",
    roll: 13,
  };

  const response = await sendRequest({
    method: "POST",
    urlPath: "/api/v1/students",
    headers: makeAuthHeaders(),
    body: payload,
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    message: "Student added and verification email sent successfully.",
  });
  assert.deepStrictEqual(serviceState.calls.addNewStudent[0][0], payload);
});

test("GET /api/v1/students/:id returns one student", async () => {
  resetServiceState();
  serviceState.impl.getStudentDetail = async (id) => ({
    id: Number(id),
    name: "Student Detail",
    email: "detail@example.com",
  });

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students/42",
    headers: makeAuthHeaders(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    id: 42,
    name: "Student Detail",
    email: "detail@example.com",
  });
  assert.strictEqual(serviceState.calls.getStudentDetail[0][0], "42");
});

test("PUT /api/v1/students/:id updates a student and injects route id", async () => {
  resetServiceState();
  const payload = {
    name: "Updated Student",
    email: "updated@example.com",
  };

  const response = await sendRequest({
    method: "PUT",
    urlPath: "/api/v1/students/17",
    headers: makeAuthHeaders(),
    body: payload,
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    message: "Student updated successfully",
  });
  assert.deepStrictEqual(serviceState.calls.updateStudent[0][0], {
    ...payload,
    userId: "17",
  });
});

test("POST /api/v1/students/:id/status changes status and injects reviewer id", async () => {
  resetServiceState();
  const payload = { status: false };

  const response = await sendRequest({
    method: "POST",
    urlPath: "/api/v1/students/25/status",
    headers: makeAuthHeaders({ userId: 501 }),
    body: payload,
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    message: "Student status changed successfully",
  });
  assert.deepStrictEqual(serviceState.calls.setStudentStatus[0][0], {
    status: false,
    userId: "25",
    reviewerId: 501,
  });
});

test("student service errors are returned by the global error handler", async () => {
  resetServiceState();
  const { ApiError } = require(path.join(rootDir, "src/utils"));
  serviceState.impl.getStudentDetail = async () => {
    throw new ApiError(404, "Student not found");
  };

  const response = await sendRequest({
    method: "GET",
    urlPath: "/api/v1/students/404",
    headers: makeAuthHeaders(),
  });

  assert.strictEqual(response.statusCode, 404);
  assert.deepStrictEqual(response.body, {
    error: "Student not found",
  });
});

test("DELETE /api/v1/students/:id deletes a student", async () => {
  resetServiceState();

  const response = await sendRequest({
    method: "DELETE",
    urlPath: "/api/v1/students/88",
    headers: makeAuthHeaders(),
  });

  assert.strictEqual(response.statusCode, 200);
  assert.deepStrictEqual(response.body, {
    message: "Student deleted successfully",
  });
  assert.strictEqual(serviceState.calls.deleteStudent[0][0], "88");
});

async function main() {
  const originalConsoleError = console.error;
  console.error = () => {};
  let failed = false;

  try {
    for (const currentTest of tests) {
      try {
        await currentTest.fn();
        process.stdout.write(`PASS ${currentTest.name}\n`);
      } catch (error) {
        failed = true;
        process.stderr.write(`FAIL ${currentTest.name}\n${error.stack}\n`);
      }
    }
  } finally {
    console.error = originalConsoleError;
  }

  if (failed) {
    process.exit(1);
    return;
  }

  process.stdout.write(`\n${tests.length} students API tests passed.\n`, () => {
    process.exit(0);
  });
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
