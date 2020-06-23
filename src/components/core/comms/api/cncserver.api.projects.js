/**
 * @file CNCServer ReSTful API endpoint for high level project management.
 */
const handlers = {};

module.exports = (cncserver) => {
  handlers['/v2/projects'] = (req, res) => {
    const { projects } = cncserver;

    // Standard projects api return.
    const projectsBody = () => ({
      current: projects.getCurrentHash(),
      rendering: projects.getRenderingState(),
      printing: projects.getPrintingState(),
      items: projects.getItems(),
    });

    // Enumerate projects.
    if (req.route.method === 'get') {
      return { code: 200, body: projectsBody() };
    }

    // Create a project.
    if (req.route.method === 'post') {
      // Validate the request data against the schema before continuing.
      cncserver.schemas.validateData('projects', req.body, true)
        .then(projects.addItem)
        .then((item) => { res.status(200).send(item); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Allow modification of general project management state:
    //   "current": Open a project by patching "current" key with project hash.
    //   "rendering": Start rending by setting to true.
    //   "printing": Start printing render by setting to true.
    if (req.route.method === 'patch') {
      const { current, rendering, printing } = req.body || {};

      // Sanity check hash lookup.
      if (current) {
        if (!projects.items.has(current)) {
          return [404, `Project with hash ID "${current}" not found`];
        }
        if (projects.getCurrentHash() === current) {
          return [302, 'Project already loaded.'];
        }

        // Actually open the project.
        projects.open(current);
      } else if (rendering !== undefined) {
        projects.setRenderingState(rendering);
      } else if (printing !== undefined) {
        projects.setPrintingState(printing);
      } else {
        // Nothing sent right, let em know.
        return [406, 'Patch either "current" hash to open, or new "rendering" or "printing" state.'];
      }

      // Return the full new projects return body.
      return { code: 200, body: projectsBody() };
    }

    // Error to client for unsupported request types.
    return false;
  };


  // Individual project management.
  handlers['/v2/projects/:hash'] = (req, res) => {
    const { projects } = cncserver;

    // Shortcut "current" hash lookup.
    const hash = req.params.hash === 'current'
      ? projects.getCurrentHash()
      : req.params.hash;

    // Sanity check hash lookup.
    if (!projects.items.has(hash)) {
      return [404, `Project with hash ID "${hash}" not found`];
    }

    // Get the project via validated hash.
    const project = projects.getResponseItem(hash);

    // Display item.
    if (req.route.method === 'get') {
      return { code: 200, body: project };
    }

    // Patch item.
    if (req.route.method === 'patch') {
      // Validate the request data against the schema before continuing.
      const mergedProject = { ...project, ...req.body };
      cncserver.schemas.validateData('projects', mergedProject)
        .then(() => projects.editItem(project, req.body))
        .then((item) => { res.status(200).send(item); })
        .catch(cncserver.rest.err(res));

      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Remove item.
    if (req.route.method === 'delete') {
      projects.removeItem(hash).then(() => {
        res.status(200).send({ status: `Project identified by "${hash}" moved to trash directory` });
      }).catch((err) => {
        const errBody = {
          status: 'error',
          message: err,
        };

        if (err.stack) errBody.stack = err.stack;
        res.status(500).send(errBody);
      });

      return true; // Tell endpoint wrapper we'll handle the response
    }

    // Error to client for unsupported request types.
    return false;
  };

  return handlers;
};
