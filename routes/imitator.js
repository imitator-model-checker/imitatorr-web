const fs = require('fs');
const path = require('path');
const express = require('express');
const config = require('../config');
const utils = require('../libs/utils');
const { v4: uuidv4 } = require('uuid');
const upload = require('../libs/multer');
const debug = require('debug')('imitator-runner:api');
const { runImitator, zipImitatorFiles } = require('../libs/imitator');

const router = express.Router();

/**
 * @swagger
 *
 * /api/imitator:
 *  get:
 *    description: Get welcome message
 *    tags:
 *      - imitator
 *    produces:
 *      - application/json
 *    responses:
 *      200:
 *        description: OK
 */
router.get('/', (req, res) => {
  res.json({ message: 'Imitator API' });
});

/**
 * @swagger
 *
 * /api/imitator/run:
 *  post:
 *    description: Run imitator
 *    tags:
 *      - imitator
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              model:
 *                description: imitator model
 *                required: true
 *                type: string
 *                format: byte
 *              property:
 *                description: imitator property
 *                required: true
 *                type: string
 *                format: byte
 *              options:
 *                description: imitator options
 *                type: string
 *              timeout:
 *                description: timeout of execution
 *                type: string
 *    responses:
 *      200:
 *        description: Information about the imitator execution
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              properties:
 *                result:
 *                  type: object
 *                  properties:
 *                    model:
 *                      description: imitator model
 *                      type: string
 *                    property:
 *                      description: imitator property
 *                      type: string
 *                    options:
 *                      description: imitator options
 *                      type: string
 *                    file:
 *                      description: filename of the zipped file
 *                      type: string
 *                    generatedFiles:
 *                      description: files generated by imitator
 *                      type: array
 *                      items:
 *                        type: string
 *                    identifier:
 *                      description: identifier of the execution
 *                      type: string
 *                    output:
 *                      description: imitator output
 *                      type: string
 */
router.post('/run', upload, async (req, res) => {
  try {
    const io = req.app.locals.io;

    // @ts-ignore
    const models = req.files.models;

    // @ts-ignore
    const property = req.files.property[0];

    // check required fields
    if (models.length === 0 || !property) {
      throw new Error('Model and property fields are required');
    }

    // identifier of the run
    const identifier = uuidv4();
    const outputFolder = path.join(property.destination, identifier);
    debug('output folder: ', outputFolder);

    const propertyPath = await utils.moveToFolder(outputFolder, [property]);
    debug('property file: ', propertyPath[0]);

    const modelsPath = await utils.moveToFolder(outputFolder, models);
    debug('model paths: ', modelsPath);

    // imitator options
    let options = req.body.options || '';
    options = options.length !== 0 ? options.trim().split(' ') : [];

    // filter options
    const forbiddenOptions = ['-output-prefix'];
    options = options.filter((o) => {
      const sentOption = o.split('=')[0];
      return !forbiddenOptions.includes(sentOption);
    });
    debug('options: ', options);

    // run all the experiments asynchronously
    const outputs = await Promise.all(
      modelsPath.map((m) =>
        runImitator(m, propertyPath[0], options, outputFolder, io)
      )
    );
    debug('imitator outputs: ', outputs);

    const result = {
      options,
      identifier,
      outputs,
      models: models.map((m) => m.originalname),
      property: property.originalname,
    };

    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 *
 * /api/imitator/download:
 *  post:
 *    description: Download imitator output
 *    tags:
 *      - imitator
 *    requestBody:
 *      required: true
 *      content:
 *        application/json:
 *          schema:
 *            type: object
 *            properties:
 *              file:
 *                description: filename of the imitator output
 *                type: string
 *    responses:
 *      200:
 *        description: compressed file with imitator output
 *        content:
 *          application/octet-stream:
 *            schema:
 *              type: string
 *              format: binary
 */
router.post('/download', async (req, res) => {
  try {
    const file = req.body.file;
    const identifier = req.body.identifier;

    if (!file) throw new Error('filename is required');
    if (!identifier) throw new Error('identifier is required');

    // zip all the files generated by imitator
    // const zipFile = await zipImitatorFiles(outputs, outputFolder);

    // check if file exist
    const fullPath = path.join(config.uploadFolder, identifier, file);
    await fs.promises.access(fullPath);

    res.download(fullPath);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
