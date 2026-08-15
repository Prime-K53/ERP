import React from 'react';
import { ServiceProvider } from '../../context/ServiceContext';
import ServiceJobDashboard from '../../components/service/ServiceJobDashboard';

const ServiceJobsPage: React.FC = () => {
    return (
        <ServiceProvider>
            <ServiceJobDashboard />
        </ServiceProvider>
    );
};

export default ServiceJobsPage;
