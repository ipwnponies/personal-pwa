import React, { useState } from 'react';

const getStatus = async (setNodes) => {
  const data = await voltaApi();

  console.log(data);
  setNodes(data);
};

const voltaApi = async () => {
  const url = 'https://api.voltaapi.com/v1/pg-graphql';
  const headers = {
    'X-Api-Key': process.env.NEXT_PUBLIC_VOLTA_API_KEY,
    Accept: '*/*',
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({
    query:
      'query getStation($locationNodeId: ID!) { locationByNodeId(nodeId: $locationNodeId) { name tips stationsByLocationId(orderBy: STATION_NUMBER_ASC) { edges { node { name status evses { edges { node { state } } } } } } } } ',
    variables: {
      locationNodeId:
        'WyJzaXRlcyIsIjk0N2JiYjc5LWM3Y2UtNGE5NC05NDMwLTk3OGQzZjY3ZDUzNCJd',
    },
  });
  const response = await fetch(url, {
    headers,
    body,
    method: 'POST',
    // mode: 'cors',
  }).then((i) => i.json());
  const nodes = response.data.locationByNodeId.stationsByLocationId.edges.map(
    (i) => {
      const { name, status, evses } = i.node;
      const outlets = evses.edges.map((i) => i.node.state);

      const counter = {};
      for (i of outlets) {
        if (counter[i]) {
          counter[i]++;
        } else {
          counter[i] = 1;
        }
      }

      return { name, status, counter };
    },
  );

  return nodes;
};

const colour = {
  PLUGGED_OUT: 'palegreen',
  CHARGING: 'salmon',
  ACTIVE: 'green',
  NEEDS_SERVICE: 'red',
};

const displayStation = ({ name, status, counter }) => (
  <p>
    {`${name} is `} <span style={{ color: colour[status] }}>{status}</span>. It
    has chargers with:
    {Object.entries(counter).map(([key, value]) => (
      <p style={{ fontFamily: 'monospace' }}>
        <span style={{ backgroundColor: colour[key] }}>{key}</span>{' '}
        <span style={{ fontWeight: 'bolder' }}>{value}</span>{' '}
      </p>
    ))}
  </p>
);
export default function Foo() {
  const [nodes, setNodes] = useState();

  return (
    <>
      <button onClick={() => getStatus(setNodes)}>Refresh status</button>

      {nodes?.map((i) => displayStation(i))}
    </>
  );
}
Foo.propTypes = {};
