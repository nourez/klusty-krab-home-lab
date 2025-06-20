# Optimized Versions Server

This directory contains the Kubernetes manifests for the [Optimized Versions Server](https://github.com/streamyfin/optimized-versions-server), a companion server for Streamyfin that enables better video downloads by transcoding HLS streams into single video files.

## Components

- **Namespace**: `optimized-versions-server`
- **Deployment**: Single replica transcoding server
- **Service**: LoadBalancer service exposing port 3000 via MetalLB
- **PVC**: 50Gi cache storage using Longhorn

## Configuration

The server is configured with the following environment variables:

- `NODE_ENV`: Set to "development"
- `JELLYFIN_URL`: Points to your external Jellyfin instance
- `MAX_CONCURRENT_JOBS`: Set to 1 (adjustable based on your hardware)

## Access

The service is exposed via MetalLB LoadBalancer on your local network:
- MetalLB will assign a dedicated IP address from your configured IP pool
- Access the service at `http://<assigned-ip>:3000`
- No TLS termination - plain HTTP for local network access

## Usage with Streamyfin

Configure your Streamyfin app to use this server for optimized downloads:
- Server URL: `http://<assigned-ip>:3000`
- The server will transcode HLS streams to enable background downloads

## Finding the Assigned IP

After deployment, you can find the assigned IP address with:
```bash
kubectl get service optimized-versions-server -n optimized-versions-server
```

## Resources

The deployment is configured with:
- **Requests**: 512Mi RAM, 250m CPU
- **Limits**: 2Gi RAM, 1000m CPU

Adjust these based on your transcoding workload and available cluster resources. 