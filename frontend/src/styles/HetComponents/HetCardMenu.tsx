import { Link } from 'react-router-dom';
import HetListItemButton from './HetListItemButton';
import HetDivider from './HetDivider';
import { RouteConfig, routeConfigs } from '../../pages/Policy/policyContent/routeConfigs';

interface HetCardMenuProps {
	className?: string;
}

export default function HetCardMenu(props: HetCardMenuProps) {
	return (
		<nav
			aria-label='policy context sections'
			className={`flex flex-col rounded-sm py-0 tracking-normal shadow-raised-tighter ${props.className ?? ''
				} `}
		>
			{routeConfigs.map((config) => (
				<HetDesktopMenuItem key={config.path} routeConfig={config} />
			))}
		</nav>
	);
}

interface HetDesktopMenuItemProps {
	routeConfig: RouteConfig;
}

function HetDesktopMenuItem(props: HetDesktopMenuItemProps) {
	return (
		<>
			{props.routeConfig.isTopLevel && <HetDivider />}
			<Link className='no-underline' to={props.routeConfig.path}>
				<HetListItemButton
					className='mx-2 pl-2 font-roboto'
					selected={window.location.pathname === props.routeConfig.path}
					aria-label={props.routeConfig.label}
					option={props.routeConfig.isTopLevel ? 'boldGreen' : 'normalBlack'}
				>
					{props.routeConfig.label}
				</HetListItemButton>
			</Link>
		</>
	);
}